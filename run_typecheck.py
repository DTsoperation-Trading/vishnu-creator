import subprocess
import sys

def run_command(cmd, cwd=None, timeout=120):
    try:
        result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, shell=True)
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", "TIMEOUT", -1
    except Exception as e:
        return "", str(e), -1

def main():
    cwd = r"D:\Build App\Vishnu Creator"

    print("=== Typecheck protocol package ===")
    stdout, stderr, code = run_command("npx tsc --noEmit -p packages/protocol/tsconfig.json", cwd=cwd)
    print(f"Exit code: {code}")
    if stdout:
        print("STDOUT:")
        print(stdout[-5000:] if len(stdout) > 5000 else stdout)
    if stderr:
        print("STDERR:")
        print(stderr[-5000:] if len(stderr) > 5000 else stderr)

    print("\n=== Typecheck daemon package ===")
    stdout, stderr, code = run_command("npx tsc --noEmit -p apps/daemon/tsconfig.json", cwd=cwd)
    print(f"Exit code: {code}")
    if stdout:
        print("STDOUT:")
        print(stdout[-5000:] if len(stdout) > 5000 else stdout)
    if stderr:
        print("STDERR:")
        print(stderr[-5000:] if len(stderr) > 5000 else stderr)

if __name__ == "__main__":
    main()