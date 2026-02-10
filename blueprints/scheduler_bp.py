"""
Schedule management API.

PUT  /api/scripts/<id>/schedule  — set cron expression and enable/disable
DELETE /api/scripts/<id>/schedule — disable and remove schedule
GET  /api/scripts/<id>/schedule  — get current schedule + next run time
"""
from flask import Blueprint, request, jsonify
from extensions import db
from models.script import Script
from services.scheduler_service import register_schedule, remove_schedule, get_next_run_time

scheduler_bp = Blueprint('scheduler', __name__)


@scheduler_bp.route('/api/scripts/<script_id>/schedule', methods=['GET', 'PUT', 'DELETE'])
def manage_schedule(script_id):
    script = Script.query.get(script_id)
    if not script:
        return jsonify({'error': 'Script not found'}), 404

    if request.method == 'GET':
        return jsonify({
            'schedule_cron': script.schedule_cron,
            'schedule_enabled': script.schedule_enabled,
            'next_run_time': get_next_run_time(script.id),
        })

    elif request.method == 'PUT':
        data = request.json or {}
        cron = data.get('cron', '').strip()
        enabled = bool(data.get('enabled', False))

        if enabled and not cron:
            return jsonify({'error': 'cron expression required when enabled=true'}), 400

        # Validate cron syntax before saving
        if cron:
            try:
                from apscheduler.triggers.cron import CronTrigger
                CronTrigger.from_crontab(cron)
            except Exception as e:
                return jsonify({'error': f'Invalid cron expression: {e}'}), 400

        script.schedule_cron = cron or None
        script.schedule_enabled = enabled
        db.session.commit()

        from flask import current_app
        register_schedule(current_app._get_current_object(), script)

        return jsonify({
            'schedule_cron': script.schedule_cron,
            'schedule_enabled': script.schedule_enabled,
            'next_run_time': get_next_run_time(script.id),
        })

    elif request.method == 'DELETE':
        script.schedule_cron = None
        script.schedule_enabled = False
        db.session.commit()
        remove_schedule(script.id)
        return jsonify({'message': 'Schedule removed'})
