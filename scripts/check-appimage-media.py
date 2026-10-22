"""Check a finished AppImage (or extracted AppDir) using its actual media stack.

Requires cc, pkg-config, WebKitGTK/GStreamer development headers and a desktop or
Xvfb. No accounts, network fixture, installed app, or user profile is involved.
"""
import os
from pathlib import Path
import resource
import shlex
import subprocess
import sys
import tempfile


def run():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python3 scripts/check-appimage-media.py APPIMAGE_OR_APPDIR [--skip-plugin-check]")
    package = Path(sys.argv[1]).resolve(strict=True)
    # A deliberately broken package can abort its WebProcess; don't create cores.
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    with tempfile.TemporaryDirectory(prefix="omnia-media-") as temporary:
        root = Path(temporary)
        if package.is_file():
            subprocess.run([str(package), "--appimage-extract"], cwd=root,
                           stdout=subprocess.DEVNULL, check=True, timeout=120)
            package = root / "squashfs-root"
        web_process = next((package / "usr").rglob("WebKitWebProcess"))
        injected = next((package / "usr").rglob("libwebkit2gtkinjectedbundle.so"))
        flags = subprocess.check_output(
            ["pkg-config", "--cflags", "--libs", "webkit2gtk-4.1", "gstreamer-1.0"], text=True)
        probe = root / "media-probe"
        subprocess.run(["cc", "-Wall", "-Wextra", "-Werror",
                        str(Path(__file__).with_name("appimage-media-probe.c")),
                        "-o", str(probe), *shlex.split(flags)], check=True)
        env = dict(os.environ, APPDIR=str(package),
                   LD_LIBRARY_PATH=str(package / "usr/lib"),
                   WEBKIT_EXEC_PATH=str(web_process.parent),
                   WEBKIT_INJECTED_BUNDLE_PATH=str(injected.parent),
                   GST_REGISTRY=str(root / "registry.bin"),
                   XDG_DATA_HOME=str(root / "data"),
                   XDG_CONFIG_HOME=str(root / "config"),
                   XDG_CACHE_HOME=str(root / "cache"))
        linked = subprocess.check_output(["ldd", str(probe)], env=env, text=True)
        for library in ("libwebkit2gtk-4.1.so.0", "libjavascriptcoregtk-4.1.so.0",
                        "libgstreamer-1.0.so.0"):
            line = next(line for line in linked.splitlines()
                        if line.strip().startswith(library + " => "))
            path = Path(line.split(" => ", 1)[1].split(" (0x", 1)[0].strip()).resolve()
            if not path.is_relative_to(package):
                raise RuntimeError(f"{library} resolved outside the package: {path}")
        # The exact shipped hooks select its GStreamer plugins/scanner and GTK.
        # Arguments are positional, never interpolated into shell source.
        completed = subprocess.run([
            "bash", "-ec",
            'for hook in "$APPDIR"/apprun-hooks/*.sh; do source "$hook"; done; exec "$@"',
            "omnia-media", str(probe), *sys.argv[2:]], env=env,
            cwd=package / "usr", timeout=35)
        return completed.returncode


if __name__ == "__main__":
    sys.exit(run())
