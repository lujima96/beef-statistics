"""Pipeline wrapper for trimmings AM builder."""


def run() -> None:
    from scripts.trimmings_am_builder import trimmings_am_builder

    trimmings_am_builder.run()
