"""Make an ExeFS delta for the verified four-byte icon variant.

Run from F:\\nintendo3ds\\roms with xdelta3.exe in the same directory:
    python path\\to\\make_exefs_variant.py
Only the resulting exefs_variant.xdelta and printed hashes need to be shared.
"""

from hashlib import sha256
from pathlib import Path
import subprocess
import sys


EXPECTED_BASE = "c68a4ef55a90565c80ef4701952cd99b341b8df00c200b0a7dbad8727575ef48"
EXPECTED_NEW = "b706722e8250035143a1059754a95975aa8595525f4911b763559e4783d79712"
EXPECTED_PATCHED = "95e65ba0cdb0babd8183a916368d27f5808144c4251ebddb757959b065663561"


def digest(data):
    return sha256(data).hexdigest()


def section(data, name):
    if len(data) < 0x200:
        raise ValueError("ExeFS header is too short")
    for index in range(10):
        at = index * 0x10
        entry_name = bytes(data[at:at + 8]).split(b"\0", 1)[0].decode("ascii")
        if entry_name != name:
            continue
        offset = int.from_bytes(data[at + 8:at + 12], "little") + 0x200
        size = int.from_bytes(data[at + 12:at + 16], "little")
        if not size or offset + size > len(data):
            raise ValueError(f"Invalid {name} section range")
        hash_at = 0x1e0 - index * 0x20
        actual = sha256(data[offset:offset + size]).digest()
        if data[hash_at:hash_at + 32] != actual:
            raise ValueError(f"{name} section hash in ExeFS header is invalid")
        return offset, size, hash_at
    raise ValueError(f"Missing {name} section")


def make_variant(base, new, patched):
    if digest(base) != EXPECTED_BASE or digest(new) != EXPECTED_NEW or digest(patched) != EXPECTED_PATCHED:
        raise ValueError("ExeFS SHA-256 mismatch; refusing to build a delta for unverified input")
    if len(base) != len(new):
        raise ValueError("Source ExeFS sizes differ")
    old_at, old_size, old_hash_at = section(base, "icon")
    new_at, new_size, new_hash_at = section(new, "icon")
    patched_at, patched_size, patched_hash_at = section(patched, "icon")
    if (old_at, old_size, old_hash_at) != (new_at, new_size, new_hash_at):
        raise ValueError("Source icon layout differs")
    if patched_size != old_size or patched[patched_at:patched_at + patched_size] != base[old_at:old_at + old_size]:
        raise ValueError("The translated ExeFS also changes icon; inspect manually")
    allowed = set(range(old_hash_at, old_hash_at + 32)) | set(range(old_at, old_at + old_size))
    differences = [i for i, (a, b) in enumerate(zip(base, new)) if a != b]
    if len(differences) != 36 or any(i not in allowed for i in differences):
        raise ValueError("Unexpected differences outside icon and its header hash")
    if sum(old_at <= i < old_at + old_size for i in differences) != 4:
        raise ValueError("Expected exactly four changed icon bytes")

    output = bytearray(patched)
    icon = new[new_at:new_at + new_size]
    output[patched_at:patched_at + patched_size] = icon
    output[patched_hash_at:patched_hash_at + 32] = sha256(icon).digest()
    for name in (".code", "banner", "icon"):
        section(output, name)
    return output


def main():
    root = Path.cwd()
    variant = root / "new_cia_regions" / "exefs.bin"
    xdelta = root / "xdelta3.exe"
    candidates = sorted(root.glob("cia_compare_*"), key=lambda p: p.stat().st_mtime, reverse=True)
    pair = next(((p / "pripara-godmode" / "exefs.bin", p / "patched" / "exefs.bin")
                 for p in candidates if (p / "pripara-godmode" / "exefs.bin").is_file()
                 and (p / "patched" / "exefs.bin").is_file()), None)
    if not pair or not variant.is_file() or not xdelta.is_file():
        raise FileNotFoundError("Need cia_compare_*/{pripara-godmode,patched}/exefs.bin, "
                                "new_cia_regions/exefs.bin, and xdelta3.exe under the current folder")
    output = make_variant(pair[0].read_bytes(), variant.read_bytes(), pair[1].read_bytes())
    target = root / "new_cia_regions" / "exefs_variant_target.bin"
    patch = root / "new_cia_regions" / "exefs_variant.xdelta"
    verified = root / "new_cia_regions" / "exefs_variant_verified.bin"
    target.write_bytes(output)
    try:
        subprocess.run([str(xdelta), "-e", "-a", "-S", "none", "-D", "-s",
                        str(variant), str(target), str(patch)], check=True)
        subprocess.run([str(xdelta), "-d", "-a", "-D", "-s", str(variant),
                        str(patch), str(verified)], check=True)
        if verified.read_bytes() != output:
            raise ValueError("Xdelta round-trip mismatch")
    finally:
        verified.unlink(missing_ok=True)
    print(f"source SHA-256: {digest(variant.read_bytes())}")
    print(f"target SHA-256: {digest(output)}")
    print(f"patch SHA-256:  {digest(patch.read_bytes())}")
    print(f"patch size:    {patch.stat().st_size}")
    print(f"Attach only:   {patch}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f"Failed: {error}")
