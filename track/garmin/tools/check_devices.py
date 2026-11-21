"""Check the manifest's products against the device files the SDK uses, and print what each offers a data field.

    python tools/check_devices.py <Devices folder> [manifest.xml]

For each product: whether its folder exists, the highest Connect IQ version of its part numbers, the memory
limit of a data field (compiler.json « appTypes »), its screen. Exits 1 if a product is missing or below
API 5.0.0 (foreground makeWebRequest in data fields).
"""
import json
import os
import sys
import xml.etree.ElementTree as ET

NS = {"iq": "http://www.garmin.com/xml/connectiq"}


def version(s):
    try:
        return tuple(int(x) for x in str(s).split("."))
    except ValueError:
        return (0,)


def main():
    devices = sys.argv[1]
    manifest = sys.argv[2] if len(sys.argv) > 2 else "manifest.xml"
    products = [p.get("id") for p in ET.parse(manifest).getroot().iterfind(".//iq:product", NS)]
    bad = 0
    print(f"{'product':22} {'CIQ':>7} {'datafield':>10} screen")
    for pid in products:
        path = os.path.join(devices, pid, "compiler.json")
        if not os.path.exists(path):
            print(f"{pid:22} MISSING")
            bad += 1
            continue
        with open(path, encoding="utf-8") as f:
            c = json.load(f)
        ciq = max((version(p.get("connectIQVersion", "0")) for p in c.get("partNumbers", [])), default=(0,))
        mem = next((a.get("memoryLimit") for a in c.get("appTypes", []) if a.get("type") == "datafield"), None)
        res = c.get("resolution", {})
        screen = f"{c.get('deviceFamily', '')} {res.get('width', '?')}x{res.get('height', '?')}"
        print(f"{pid:22} {'.'.join(map(str, ciq)):>7} {str(mem):>10} {screen}")
        if ciq < (5, 0, 0) or mem is None:
            bad += 1
    if bad:
        print(f"{bad} product(s) missing, below API 5.0.0 or without data fields")
        sys.exit(1)


if __name__ == "__main__":
    main()
