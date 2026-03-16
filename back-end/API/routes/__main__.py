from __future__ import annotations

import uvicorn

from config import config


def main() -> None:
    uvicorn.run("routes:app", host=config.api_host, port=config.api_port, reload=True)


if __name__ == "__main__":
    main()
