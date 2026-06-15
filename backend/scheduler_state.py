"""Shared scheduler instance — prevents circular imports between server.py and routers."""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def reschedule_collection_jobs(
    person_count_interval: int,
    analytics_interval: int,
    data_retention_days: int,
) -> None:
    """Update APScheduler jobs when settings change."""
    if scheduler.get_job("collect_snapshots"):
        scheduler.reschedule_job(
            "collect_snapshots",
            trigger=CronTrigger(minute=f"*/{person_count_interval}"),
        )
        logger.info("collect_snapshots rescheduled: every %d minutes", person_count_interval)

    if scheduler.get_job("collect_analytics_snapshots"):
        scheduler.reschedule_job(
            "collect_analytics_snapshots",
            trigger=CronTrigger(minute=f"*/{analytics_interval}"),
        )
        logger.info("collect_analytics_snapshots rescheduled: every %d minutes", analytics_interval)

    if scheduler.get_job("cleanup_old_snapshots"):
        from data_collector import cleanup_old_snapshots
        scheduler.add_job(
            cleanup_old_snapshots,
            CronTrigger(day_of_week="sun", hour="3", minute="0"),
            id="cleanup_old_snapshots",
            replace_existing=True,
            kwargs={"days_to_keep": data_retention_days},
        )
        logger.info("cleanup_old_snapshots rescheduled: keeping %d days", data_retention_days)
