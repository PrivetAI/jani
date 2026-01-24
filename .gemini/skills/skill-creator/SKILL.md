---
name: skill-creator
description: Guide for creating effective skills that extend Claude's capabilities. Use when users want to create a new skill, update an existing skill, or need guidance on skill structure, bundled resources (scripts, references, assets), progressive disclosure patterns, or the skill creation workflow (understand → plan → init → edit → package → iterate).
---

# Skill Creator

Create modular, self-contained skill packages that extend Claude's capabilities.

## Core Principles

### Concise is Key
Context window is shared. Only add what Claude doesn't know. Challenge each piece: "Does this justify its token cost?"

### Degrees of Freedom
- **High** (text instructions): Multiple valid approaches, context-dependent decisions
- **Medium** (pseudocode/parameterized scripts): Preferred pattern exists, some variation OK
- **Low** (specific scripts, few params): Fragile operations, consistency critical

## Skill Structure

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter: name, description (required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/     - Executable code for deterministic tasks
    ├── references/  - Documentation loaded as needed
    └── assets/      - Templates, images used in output
```

### Frontmatter Guidelines
- `name`: Skill identifier
- `description`: Primary trigger mechanism. Include WHAT it does AND WHEN to use it. All trigger info here—body loads only after triggering.

### Resource Guidelines
- **scripts/**: Reusable code for repetitive/deterministic tasks. Test before including.
- **references/**: Detailed docs, schemas, examples. Keep SKILL.md lean.
- **assets/**: Files used in output (templates, images, fonts).

### What NOT to Include
No README, CHANGELOG, INSTALLATION_GUIDE, or auxiliary docs. Skills are for AI agents, not human documentation.

## Progressive Disclosure

Three-level loading: metadata (~100 words) → SKILL.md body (<500 lines) → bundled resources (as needed).

**Pattern 1**: High-level guide with references
```markdown
## Quick start
[code example]
## Advanced
- **Forms**: See [FORMS.md](references/forms.md)
```

**Pattern 2**: Domain organization
```
references/
├── finance.md
├── sales.md
└── product.md
```

**Pattern 3**: Conditional details
```markdown
## Basic usage
[simple approach]
**For advanced**: See [ADVANCED.md](references/advanced.md)
```

Keep references one level deep. Include TOC in files >100 lines.

## Creation Process

### 1. Understand with Examples
Ask for concrete usage examples. What triggers this skill? What functionality needed?

### 2. Plan Resources
Analyze each example:
1. How to execute from scratch?
2. What scripts/references/assets help with repeated execution?

### 3. Initialize
Run `scripts/init_skill.py <skill-name> --path <output-directory>` for new skills.

### 4. Edit
- Implement resources identified in step 2
- Update SKILL.md with clear instructions
- Test any scripts by running them
- Delete unused example files
- See [references/workflows.md](references/workflows.md) for workflow patterns
- See [references/output-patterns.md](references/output-patterns.md) for output patterns

### 5. Package
Run `scripts/package_skill.py <path/to/skill-folder>` to validate and create `.skill` file.

### 6. Iterate
Test on real tasks → identify struggles → update skill → test again.
