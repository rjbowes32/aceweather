from __future__ import annotations

import os
import sys


def main() -> None:
    sink = open(os.devnull, "w", encoding="utf-8")
    sys.stdout = sink
    sys.stderr = sink

    import server

    server.run()


if __name__ == "__main__":
    main()
