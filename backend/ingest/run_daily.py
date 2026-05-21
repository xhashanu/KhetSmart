"""Daily job: mandi prices. Schedule via Task Scheduler / cron."""
from ingest.fetch_mandi_datagov import main as fetch_mandi

if __name__ == "__main__":
    fetch_mandi()
