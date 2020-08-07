# Main classes
This folder contains a collection of classes containing most application logic.

## Inheritance structure
```bash
├── index.ts
├── base.ts (abstract)
│   ├── project.ts
│   ├── projectChild.ts (abstract)
│   │   ├── asset.ts
│   │   ├── block.ts
│   │   ├── page.ts
│   │   ├── snapshot.ts
└── └── └── theme.ts
```