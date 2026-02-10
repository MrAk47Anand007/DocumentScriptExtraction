"""
APScheduler integration for cron-based script scheduling.

Design: use MemoryJobStore (no pickling needed). Schedule state is persisted
in Script.schedule_cron / Script.schedule_enabled in the DB. On server start,
init_scheduler() reloads all enabled schedules from the DB into memory.

The scheduler is a module-level singleton started once in create_app().
register_schedule() / remove_schedule() manage per-script jobs.
Each job calls _run_scheduled_script() which triggers the async runner.
"""
import os
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.triggers.cron import CronTrigger

# Module-level scheduler singleton — MemoryJobStore avoids pickling issues
scheduler = BackgroundScheduler(
    executors={'default': ThreadPoolExecutor(4)},
    job_defaults={
        'coalesce': True,       # Only one run if triggers fired while server was down
        'max_instances': 1,     # Prevent a script from overlapping with itself
        'misfire_grace_time': 60,
    }
)


def init_scheduler(app):
    """
    Start the scheduler and re-register all enabled schedules from the DB.
    Call once from create_app() after db.create_all().
    """
    if not scheduler.running:
        scheduler.start()

    # Reload enabled schedules from DB into memory
    with app.app_context():
        from models.script import Script
        for script in Script.query.filter_by(schedule_enabled=True).all():
            if script.schedule_cron:
                _add_job(app, script)


def register_schedule(app, script):
    """Add or replace the cron job for a script."""
    _remove_job(script.id)
    if script.schedule_enabled and script.schedule_cron:
        _add_job(app, script)


def remove_schedule(script_id: str):
    """Remove a script's cron job."""
    _remove_job(script_id)


def _job_id(script_id: str) -> str:
    return f"script_{script_id}"


def _add_job(app, script):
    try:
        trigger = CronTrigger.from_crontab(script.schedule_cron)
        scheduler.add_job(
            func=_run_scheduled_script,
            trigger=trigger,
            id=_job_id(script.id),
            args=[app, script.id],
            replace_existing=True,
        )
    except Exception as e:
        print(f"Warning: could not schedule {script.name}: {e}")


def _remove_job(script_id: str):
    job_id = _job_id(script_id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)


def _run_scheduled_script(app, script_id: str):
    """APScheduler calls this in a thread pool thread when the cron fires."""
    with app.app_context():
        from extensions import db
        from models.script import Script, Build
        from services.script_runner import execute_script_async

        script = db.session.get(Script, script_id)
        if not script:
            return

        script_path = os.path.join(app.config['SCRIPTS_FOLDER'], script.filename)
        if not os.path.exists(script_path):
            return

        build = Build(script_id=script.id, status='pending', triggered_by='scheduler')
        db.session.add(build)
        db.session.commit()

        build_dir = os.path.join(app.config['BUILDS_FOLDER'], script.filename)
        os.makedirs(build_dir, exist_ok=True)

        execute_script_async(app, build.id, script_path, build_dir)


def get_next_run_time(script_id: str):
    """Return ISO string of next scheduled run, or None."""
    job = scheduler.get_job(_job_id(script_id))
    if job and job.next_run_time:
        return job.next_run_time.isoformat()
    return None
