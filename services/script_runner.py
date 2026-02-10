"""
Async script execution engine.

execute_script_async() launches a background thread that:
1. Runs the script via subprocess
2. Writes each output line to a .log file AND a per-build queue.Queue
3. Updates Build.status / timestamps in the DB via the app context

The SSE endpoint reads from the queue in real time while the script runs.
If the script has already finished, it falls back to reading the log file.
"""
import os
import subprocess
import threading
import queue
from datetime import datetime


# Process-level dict: build_id -> Queue
# Populated when a build starts, cleaned up when it finishes.
_output_queues: dict = {}
_lock = threading.Lock()

# Sentinel value that signals end-of-stream to SSE clients
_DONE = None


def execute_script_async(app, build_id: str, script_path: str,
                         build_dir: str, env_vars: dict = None):
    """
    Launch script execution in a background thread.
    Returns immediately. Caller should open the SSE stream endpoint
    to get real-time output.
    """
    q = queue.Queue()
    with _lock:
        _output_queues[build_id] = q

    log_file = os.path.join(build_dir, f"{build_id}.log")

    thread = threading.Thread(
        target=_run_in_thread,
        args=(app, build_id, script_path, log_file, env_vars, q),
        daemon=True
    )
    thread.start()
    return log_file


def _run_in_thread(app, build_id, script_path, log_file, env_vars, q):
    """Background thread body: run script, stream output, update DB."""
    import sys

    with app.app_context():
        from extensions import db
        from models.script import Build

        build = db.session.get(Build, build_id)
        if build:
            build.status = 'running'
            build.started_at = datetime.utcnow()
            build.log_file = log_file
            db.session.commit()

    try:
        env = os.environ.copy()
        if env_vars:
            env.update({k: str(v) for k, v in env_vars.items()})

        os.makedirs(os.path.dirname(log_file), exist_ok=True)

        with open(log_file, 'w', encoding='utf-8', errors='replace') as f:
            process = subprocess.Popen(
                [sys.executable, script_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=env,
            )

            for line in process.stdout:
                f.write(line)
                f.flush()
                q.put(line)

            process.wait()
            exit_code = process.returncode

    except Exception as e:
        error_line = f"ERROR: {e}\n"
        try:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(error_line)
        except Exception:
            pass
        q.put(error_line)
        exit_code = -1

    finally:
        # Signal end-of-stream
        q.put(_DONE)

        with app.app_context():
            from extensions import db
            from models.script import Build

            build = db.session.get(Build, build_id)
            if build:
                build.status = 'success' if exit_code == 0 else 'failure'
                build.exit_code = exit_code
                build.finished_at = datetime.utcnow()
                db.session.commit()

        with _lock:
            _output_queues.pop(build_id, None)


def get_output_queue(build_id: str):
    """Return the live queue for a running build, or None if already finished."""
    with _lock:
        return _output_queues.get(build_id)
