#!/usr/bin/env python3
"""Static SCC corpus inventory for the Agent (2001) browser-engine audit.

Read-only analysis of the original `Scripts/*.scc` files. This script does not
modify any game resource and does not run Ghidra. It prints a compact report and
optionally writes a machine-readable JSON to a caller-supplied path (only when explicitly requested).

Grammar model (from SCC_RUNTIME.md / SCENE_TRANSITIONS.md and direct inspection):
  * a line with NO leading whitespace is a TOP-LEVEL statement;
  * indented lines belong to the enclosing Sound / Click / Case block;
  * `Inc <path>`, `Object`, `Active`, `Light`, `Back`, `Mask`, `Portal`,
    `Focus`, `Anim`, `Animc`, `Sound`, `Fram`, `Fault`, `Click` are top-level;
  * inside `Click { ... }` the runtime commands are the remaining first-tokens.
"""

import collections
import json
import os
import re
import sys

SCRIPTS = os.environ.get(
    "SCC_SCRIPTS",
    "/Users/le30r/repos/agent-revers/agent-original/game-installed/Program_Executable_Files/Scripts",
)

# Commands the browser port implements in src/scc/runtime.ts parseScc.
SUPPORTED_CLICK_COMMANDS = {
    "goto", "start", "startw", "stop", "setxy", "addtol", "remtol", "cursor",
    "state", "objzet", "level", "goport", "lstate", "show", "hide", "setzon",
    "sclipw", "smusic",
}

# Top-level statements the browser port understands (across its parsers).
SUPPORTED_TOP_LEVEL = {
    "inc", "object", "active", "light", "back", "mask", "portal", "focus",
    "anim", "animc", "sound", "fram", "click",
}
# Top-level statements the port does NOT implement at all.
UNSUPPORTED_TOP_LEVEL = {"fault"}

LEVEL_RE = re.compile(r"^Level(\d+)\.scc$")


def tokenize(line):
    return line.split()


def analyze(path):
    with open(path, "r", encoding="cp1251", errors="replace") as fh:
        text = fh.read()
    lines = [ln.rstrip("\n").rstrip("\r") for ln in text.split("\n")]

    top = collections.Counter()
    click_cmds = collections.Counter()
    top_files = collections.defaultdict(set)
    cmd_files = collections.defaultdict(set)
    decl = {
        "object": [], "active": [], "light": [], "portal": [], "focus": [],
        "back": [], "mask": [], "anim": [], "animc": [], "sound": [],
        "fault": [], "inc": [],
    }
    click_decls = []       # (itemId, event, stateObject, stateScene)
    case_map = collections.defaultdict(set)  # event -> set(case indices)
    transitions = []       # (kind, ...) level/goport/lstate

    in_click = False       # True while inside a Click block
    click_event = None
    cur_case = None

    for raw in lines:
        if not raw.strip():
            continue
        indent = len(raw) - len(raw.lstrip(" \t"))
        toks = tokenize(raw.strip())
        if not toks:
            continue
        word = toks[0].lower()

        if indent == 0:
            if word == "{":
                top[word] += 1
                continue
            if word == "}":
                top[word] += 1
                in_click = False
                click_event = None
                cur_case = None
                continue
            # Real top-level statement closes any open Click block.
            in_click = False
            click_event = None
            cur_case = None
            top[word] += 1
            top_files[word].add(os.path.basename(path))
            if word == "object" and len(toks) >= 4:
                decl["object"].append((toks[1], toks[2], toks[3]))
            elif word == "active" and len(toks) >= 8:
                decl["active"].append(tuple(toks[1:8]))
            elif word == "light" and len(toks) >= 4:
                decl["light"].append(tuple(toks[1:]))
            elif word == "portal" and len(toks) >= 4:
                decl["portal"].append((toks[1], toks[2], toks[3]))
            elif word == "focus":
                decl["focus"].append(tuple(toks[1:]))
            elif word == "back":
                decl["back"].append(toks[1] if len(toks) > 1 else "")
            elif word == "mask":
                decl["mask"].append(toks[1] if len(toks) > 1 else "")
            elif word in ("anim", "animc") and len(toks) >= 3:
                decl[word].append((toks[1], toks[2]))
            elif word == "sound" and len(toks) >= 2:
                decl["sound"].append(toks[1])
            elif word == "fault" and len(toks) >= 4:
                decl["fault"].append((toks[1], toks[2], toks[3]))
            elif word == "inc" and len(toks) >= 2:
                decl["inc"].append(toks[1])
            elif word == "click" and len(toks) >= 4:
                # Click <itemId> <event> <stateObject> [stateScene|{]
                item = toks[1]
                event = toks[2]
                state_obj = toks[3]
                state_scene = -1
                if len(toks) >= 5 and toks[4] != "{":
                    state_scene = toks[4]
                click_decls.append((item, event, state_obj, state_scene))
                in_click = True
                click_event = event
                cur_case = None
            continue

        # Indented line.
        if in_click:
            if word == "case" and len(toks) >= 2:
                cur_case = int(toks[1])
                case_map[click_event].add(cur_case)
            elif word == "break":
                cur_case = None
            else:
                click_cmds[word] += 1
                cmd_files[word].add(os.path.basename(path))
                if word == "level" and len(toks) >= 3:
                    transitions.append(("level", int(toks[1]), int(toks[2])))
                elif word == "goport" and len(toks) >= 2:
                    transitions.append(("goport", int(toks[1]), None))
                elif word == "lstate" and len(toks) >= 4:
                    # SCC order: Lstate <name> <value> <scene>
                    transitions.append(("lstate", toks[1], int(toks[2]), int(toks[3])))

    return {
        "top": top, "click_cmds": click_cmds,
        "top_files": {k: sorted(v) for k, v in top_files.items()},
        "cmd_files": {k: sorted(v) for k, v in cmd_files.items()},
        "decl": decl, "click_decls": click_decls,
        "case_map": {k: sorted(v) for k, v in case_map.items()},
        "transitions": transitions,
        "lines": len(lines),
        "bytes": os.path.getsize(path),
    }


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else None
    level_files = sorted(
        [f for f in os.listdir(SCRIPTS) if LEVEL_RE.match(f)],
        key=lambda f: int(LEVEL_RE.match(f).group(1)),
    )
    non_level = sorted(
        [f for f in os.listdir(SCRIPTS)
         if f.lower().endswith(".scc") and not LEVEL_RE.match(f)],
    )

    levels = {}
    for f in level_files:
        levels[int(LEVEL_RE.match(f).group(1))] = analyze(os.path.join(SCRIPTS, f))
    others = {f: analyze(os.path.join(SCRIPTS, f)) for f in non_level}

    # Aggregate frequencies.
    top_all = collections.Counter()
    click_all = collections.Counter()
    top_files = collections.defaultdict(set)
    cmd_files = collections.defaultdict(set)
    for a in list(levels.values()) + list(others.values()):
        for k, v in a["top"].items():
            top_all[k] += v
            top_files[k] |= set(a["top_files"].get(k, []))
        for k, v in a["click_cmds"].items():
            click_all[k] += v
            cmd_files[k] |= set(a["cmd_files"].get(k, []))

    report = {
        "level_files": sorted(levels),
        "non_level_files": non_level,
        "top_freq": {k: top_all[k] for k in sorted(top_all, key=lambda x: -top_all[x])},
        "click_freq": {k: click_all[k] for k in sorted(click_all, key=lambda x: -click_all[x])},
        "top_files": {k: sorted(v) for k, v in top_files.items()},
        "cmd_files": {k: sorted(v) for k, v in cmd_files.items()},
        "levels": {str(k): v for k, v in levels.items()},
        "others": others,
    }
    if out_path is not None:
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2, sort_keys=True)
        print(f"Wrote {out_path}")

    print("\n===== TOP-LEVEL FREQUENCY (all files) =====")
    for k in sorted(top_all, key=lambda x: -top_all[x]):
        print(f"  {k:<10} {top_all[k]:>5}   files={len(top_files[k])}")

    print("\n===== CLICK-BLOCK COMMAND FREQUENCY (all files) =====")
    for k in sorted(click_all, key=lambda x: -click_all[x]):
        sup = "OK " if k in SUPPORTED_CLICK_COMMANDS else "  **UNSUPPORTED**"
        print(f"  {k:<12} {click_all[k]:>5}   files={len(cmd_files[k]):>2}   {sup}")

    print("\n===== UNSUPPORTED CLICK COMMANDS DETAIL =====")
    for k in sorted(click_all, key=lambda x: -click_all[x]):
        if k not in SUPPORTED_CLICK_COMMANDS:
            print(f"  {k}: files = {', '.join(cmd_files[k])}")

    print("\n===== UNSUPPORTED TOP-LEVEL =====")
    for k in sorted(top_all):
        if k in ("{", "}"):
            continue
        if k not in SUPPORTED_TOP_LEVEL and k not in UNSUPPORTED_TOP_LEVEL:
            print(f"  {k}: {top_all[k]} ({', '.join(sorted(top_files[k]))})")
    print(f"  fault (not implemented): {top_all.get('fault', 0)} in {len(top_files.get('fault', []))} files")


if __name__ == "__main__":
    main()
