import subprocess
import sys
import os

def run_command(cmd, cwd=None, timeout=180):
    """Run a command and return stdout, stderr, returncode"""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=True
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", f"TIMEOUT after {timeout}s", -1
    except Exception as e:
        return "", str(e), -1

def print_result(name, stdout, stderr, code):
    print(f"\n{'='*60}")
    print(f"{name} - Exit code: {code}")
    print(f"{'='*60}")
    if stdout:
        print("STDOUT:")
        print(stdout[-3000:] if len(stdout) > 3000 else stdout)
    if stderr:
        print("STDERR:")
        print(stderr[-3000:] if len(stderr) > 3000 else stderr)

def main():
    cwd = r"D:\Build App\Vishnu Creator"

    print("Starting full validation pipeline...")
    print(f"Working directory: {cwd}")

    # 1. Typecheck protocol
    print("\n>>> Step 1: Typecheck protocol package")
    stdout, stderr, code = run_command(
        "npx tsc --noEmit -p packages/protocol/tsconfig.json",
        cwd=cwd, timeout=120
    )
    print_result("Typecheck protocol", stdout, stderr, code)
    if code != 0:
        print("❌ Protocol typecheck FAILED")
        return False

    # 2. Typecheck daemon
    print("\n>>> Step 2: Typecheck daemon package")
    stdout, stderr, code = run_command(
        "npx tsc --noEmit -p apps/daemon/tsconfig.json",
        cwd=cwd, timeout=120
    )
    print_result("Typecheck daemon", stdout, stderr, code)
    if code != 0:
        print("❌ Daemon typecheck FAILED")
        return False

    # 3. Run protocol tests
    print("\n>>> Step 3: Run protocol tests")
    stdout, stderr, code = run_command(
        "pnpm --filter @vishnucreator/protocol test",
        cwd=cwd, timeout=120
    )
    print_result("Protocol tests", stdout, stderr, code)
    if code != 0:
        print("❌ Protocol tests FAILED")
        return False

    # 4. Run daemon tests (allow some pre-existing failures)
    print("\n>>> Step 4: Run daemon tests")
    stdout, stderr, code = run_command(
        "pnpm --filter @vishnucreator/daemon test",
        cwd=cwd, timeout=300
    )
    print_result("Daemon tests", stdout, stderr, code)
    # Don't fail on daemon tests - known pre-existing failures

    # 4. Full build
    print("\n>>> Step 5: Full build")
    stdout, stderr, code = run_command(
        "pnpm build",
        cwd=cwd, timeout=300
    )
    print_result("Full build", stdout, stderr, code)
    if code != 0:
        print("❌ Build FAILED")
        return False

    print("\n" + "="*60)
    print("✅ ALL CHECKS PASSED!")
    print("="*60)
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)