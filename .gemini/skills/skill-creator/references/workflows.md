# Workflow Patterns

Patterns for designing multi-step workflows in skills.

## Sequential Workflows

For ordered steps that must execute in sequence:

```markdown
## Process

1. Validate input
2. Transform data  
3. Generate output
4. Verify result
```

Use numbered lists. Include validation/verification steps.

## Conditional Workflows

For branching logic based on context:

```markdown
## Approach

**If** file is < 1MB: Process in memory
**If** file is > 1MB: Stream processing

### In-memory processing
[steps]

### Stream processing  
[steps]
```

State conditions clearly before branching.

## Iterative Workflows

For processes requiring refinement:

```markdown
## Refinement Loop

1. Generate initial version
2. Validate against requirements
3. If issues found:
   - Identify specific problems
   - Apply targeted fixes
   - Return to step 2
4. Finalize output
```

Define clear exit conditions.

## Error Handling

Always include failure modes:

```markdown
## Error Handling

- **Missing input**: Prompt user for required data
- **Invalid format**: Show expected format with example
- **API failure**: Retry with exponential backoff (max 3)
```

## State Management

For workflows needing state:

```markdown
## State Tracking

Track in `state.json`:
- `current_step`: Step number
- `completed`: Array of completed items
- `errors`: Array of encountered errors
```

Keep state minimal. Prefer stateless when possible.
