from enum import Enum


class ComplaintStatus(str, Enum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"


ALLOWED_STATUS_TRANSITIONS = {
    ComplaintStatus.OPEN.value: {ComplaintStatus.IN_PROGRESS.value},
    ComplaintStatus.IN_PROGRESS.value: {ComplaintStatus.RESOLVED.value},
    ComplaintStatus.RESOLVED.value: set(),
}


def is_overdue(status: str, created_at, now, threshold_days: int) -> bool:
    if status == ComplaintStatus.RESOLVED.value:
        return False
    return now > created_at + __import__("datetime").timedelta(days=threshold_days)
