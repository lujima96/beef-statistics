"""Pipeline entry point for raw index parsing."""


def run() -> None:
    from scripts.equiv_index_builder import raw_index_parser

    raw_index_parser.run()
