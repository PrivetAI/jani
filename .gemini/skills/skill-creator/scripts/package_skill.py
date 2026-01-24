#!/usr/bin/env python3
"""Validate and package a skill into a distributable .skill file."""

import argparse
import os
import re
import sys
import zipfile
from pathlib import Path

import yaml


class ValidationError(Exception):
    """Skill validation error."""
    pass


def validate_frontmatter(skill_md_path: Path) -> dict:
    """Parse and validate YAML frontmatter."""
    content = skill_md_path.read_text()
    
    # Extract frontmatter
    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not match:
        raise ValidationError("Missing YAML frontmatter (must start with ---)")
    
    try:
        frontmatter = yaml.safe_load(match.group(1))
    except yaml.YAMLError as e:
        raise ValidationError(f"Invalid YAML frontmatter: {e}")
    
    # Validate required fields
    if not frontmatter:
        raise ValidationError("Empty frontmatter")
    
    if "name" not in frontmatter:
        raise ValidationError("Missing required field: name")
    
    if "description" not in frontmatter:
        raise ValidationError("Missing required field: description")
    
    # Validate description quality
    desc = frontmatter["description"]
    if len(desc) < 50:
        raise ValidationError("Description too short (min 50 chars). Include WHAT and WHEN.")
    
    if "TODO" in desc:
        raise ValidationError("Description contains TODO placeholder")
    
    return frontmatter


def validate_structure(skill_dir: Path) -> None:
    """Validate skill directory structure."""
    skill_md = skill_dir / "SKILL.md"
    
    if not skill_md.exists():
        raise ValidationError("Missing required SKILL.md")
    
    # Check SKILL.md size
    content = skill_md.read_text()
    lines = content.split("\n")
    if len(lines) > 500:
        raise ValidationError(f"SKILL.md too long ({len(lines)} lines, max 500)")
    
    # Validate no extraneous docs
    bad_files = ["README.md", "CHANGELOG.md", "INSTALLATION_GUIDE.md", "QUICK_REFERENCE.md"]
    for bad_file in bad_files:
        if (skill_dir / bad_file).exists():
            raise ValidationError(f"Remove extraneous file: {bad_file}")


def validate_skill(skill_dir: Path) -> dict:
    """Validate entire skill, return frontmatter if valid."""
    print(f"Validating: {skill_dir}")
    
    validate_structure(skill_dir)
    frontmatter = validate_frontmatter(skill_dir / "SKILL.md")
    
    print("  ✓ Structure valid")
    print("  ✓ Frontmatter valid")
    print(f"  ✓ Name: {frontmatter['name']}")
    
    return frontmatter


def package_skill(skill_dir: Path, output_dir: Path) -> Path:
    """Create .skill package (zip with .skill extension)."""
    frontmatter = validate_skill(skill_dir)
    skill_name = frontmatter["name"]
    
    output_file = output_dir / f"{skill_name}.skill"
    
    with zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(skill_dir):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            
            for file in files:
                if file.startswith("."):
                    continue
                    
                file_path = Path(root) / file
                arc_name = file_path.relative_to(skill_dir.parent)
                zf.write(file_path, arc_name)
    
    print(f"\nPackaged: {output_file}")
    return output_file


def main():
    parser = argparse.ArgumentParser(description="Validate and package a skill")
    parser.add_argument("skill_dir", help="Path to skill directory")
    parser.add_argument("output_dir", nargs="?", default=".", help="Output directory (default: current)")
    parser.add_argument("--validate-only", "-v", action="store_true", help="Only validate, don't package")
    
    args = parser.parse_args()
    
    skill_dir = Path(args.skill_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    
    if not skill_dir.is_dir():
        print(f"Error: Not a directory: {skill_dir}", file=sys.stderr)
        sys.exit(1)
    
    try:
        if args.validate_only:
            validate_skill(skill_dir)
            print("\nValidation passed!")
        else:
            output_dir.mkdir(parents=True, exist_ok=True)
            package_skill(skill_dir, output_dir)
    except ValidationError as e:
        print(f"\nValidation failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
