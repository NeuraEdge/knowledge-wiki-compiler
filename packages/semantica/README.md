# Semantica wiki compiler

`@neuraedge/knowledge-wiki-compiler-semantica` is the dependency-free Semantica
entry of NeuraEdge/knowledge-wiki-compiler. It is distributed separately so
snapshot-only hosts do not install the raw-source extraction providers.

`compileSemanticaWiki` consumes reports and conflicts from one adopted snapshot,
with canonical evidence/source IDs. It produces report Markdown bodies, stable
page slugs, related-page links, categories and a reading outline. It never
parses files, merges entities, infers relations or calls a model. The host
validates adoption and graph/report revision matching, filters authorized
source scope, resolves evidence locators and owns persistent presentation edits.

Missing evidence and duplicate page identities reject compilation. Dependencies
without a generated page produce warnings and no dangling link. Renaming a
title does not change the page slug. Conflict pages retain the conflict ID;
overview and topic pages do not pretend to be entities.

From this directory, using the repository's installed development tools:

```
npx tsc --noEmit -p tsconfig.json
npm run build
npm test
npm pack --ignore-scripts
```

OntoScience consumes an immutable commit-addressed tarball of this package,
never this checkout. This entry does not replace the existing raw-source CLI
or claim that its lifecycle/review/query implementation is used by the host.
