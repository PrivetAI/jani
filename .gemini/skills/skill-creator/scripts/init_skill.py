#!/usr/bin/env python3
"""Initialize a new skill directory with template structure."""

import argparse
import os
import sys
from pathlib import Path

SKILL_MD_TEMPLATE = '''---
name: {skill_name}
description: TODO - Describe what this skill does AND when to use it. This is the primary trigger mechanism.
---

# {skill_title}

TODO: Add skill instructions here.

## Quick Start

TODO: Essential usage patterns.

## Resources

- **Scripts**: `scripts/` contains executable utilities
- **References**: `references/` contains detailed documentation  
- **Assets**: `assets/` contains templates and files for output
'''

EXAMPLE_SCRIPT = '''#!/usr/bin/env python3
"""Example script - delete if not needed."""

def main():
    print("Example script - customize or delete")

if __name__ == "__main__":
    main()
'''

EXAMPLE_REFERENCE = '''# Example Reference

This is an example reference file. Delete if not needed.

## Contents

- Section 1
- Section 2
'''

EXAMPLE_ASSET_README = '''# Assets Directory

Place templates, images, fonts, and other output files here.
Delete this file when adding real assets.
'''


def create_skill(skill_name: str, output_path: str) -> None:
    """Create skill directory structure with templates."""
    skill_dir = Path(output_path) / skill_name
    
    if skill_dir.exists():
        print(f"Error: Directory already exists: {skill_dir}", file=sys.stderr)
        sys.exit(1)
    
    # Create directories
    (skill_dir / "scripts").mkdir(parents=True)
    (skill_dir / "references").mkdir()
    (skill_dir / "assets").mkdir()
    
    # Create SKILL.md
    skill_title = skill_name.replace("-", " ").title()
    skill_md = SKILL_MD_TEMPLATE.format(skill_name=skill_name, skill_title=skill_title)
    (skill_dir / "SKILL.md").write_text(skill_md)
    
    # Create example files
    example_script = skill_dir / "scripts" / "example.py"
    example_script.write_text(EXAMPLE_SCRIPT)
    os.chmod(example_script, 0o755)
    
    (skill_dir / "references" / "example.md").write_text(EXAMPLE_REFERENCE)
    (skill_dir / "assets" / "README.md").write_text(EXAMPLE_ASSET_README)
    
    print(f"Created skill: {skill_dir}")
    print(f"  - SKILL.md (edit frontmatter and instructions)")
    print(f"  - scripts/example.py (customize or delete)")
    print(f"  - references/example.md (customize or delete)")
    print(f"  - assets/README.md (delete when adding assets)")


def main():
    parser = argparse.ArgumentParser(description="Initialize a new skill")
    parser.add_argument("skill_name", help="Name of the skill (e.g., pdf-editor)")
    parser.add_argument("--path", "-p", default=".", help="Output directory (default: current)")
    
    args = parser.parse_args()
    
    # Validate skill name
    if not args.skill_name.replace("-", "").replace("_", "").isalnum():
        print("Error: Skill name should contain only alphanumeric, hyphens, underscores", file=sys.stderr)
        sys.exit(1)
    
    create_skill(args.skill_name, args.path)


if __name__ == "__main__":
    main()
