# Sync-AI-Metadata Instructions

## Running the Program

You can run the program directly with:

```bash
python -m sync_ai_metadata.sync_ai_metadata
```

Or, if you have an entry point defined, use:

```bash
sync-ai-metadata
```

(Replace with the actual entry point if different.)

You can also specify options, for example:

```bash
python -m sync_ai_metadata.sync_ai_metadata --log-level Debug --config path/to/config.json
```

## Running Unit Tests

To run the unit tests for this project, use the following commands from the project root:

## Run All Tests (Recommended)

```bash
pytest -v
```

- The `-v` (verbose) flag shows each test and its result for better visibility.

## Run a Specific Test File

```bash
pytest -v test/test_sync_ai_metadata.py
```

## Debugging Test Failures

To stop after a few failures and reduce output noise, use:

```bash
pytest --maxfail=5 --disable-warnings -v
```

- `--maxfail=5`: Stop after 5 test failures.
- `--disable-warnings`: Hide warning messages for cleaner output.

## Install Test Dependencies

If you haven't already, install the test dependencies:

```bash
pip install -r requirements-dev.txt
```

## Notes

- Tests can be run in the dev container or any compatible Python 3 environment.
- All test files are located in the `test/` directory.

## Building the Wheel

To build a wheel (binary distribution) of this package:

1. (Optional) Create and activate a virtual environment:

    ```bash
    python3 -m venv .venv
    source .venv/bin/activate
    ```

2. Install the build tool:

    ```bash
    pip install build
    ```

3. Build the wheel:

```bash
python -m build
```

- The wheel file will be created in the `dist/` directory.
