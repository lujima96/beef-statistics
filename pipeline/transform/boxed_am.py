"""Pipeline wrapper for boxed AM builder."""


def run() -> None:
    from scripts.boxed_am_builder import boxed_am_builder

    boxed_am_builder.run()
