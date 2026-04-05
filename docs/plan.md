A simple registry service for the data-fair stack. Will contain plugin definitions for other services and host archives of versions.

Similar to other services of the data-fair stack (express based API, vuejs UI made to be embedded in iframes in the main back-office interface, etc).

References:
- licencing strategy ../../koumoul/plateforme/open-sourcing
- catalogs service ../catalogs (plugins system will be refactored to use this service)
- processings service ../processings (plugins system will be refactored to use this service)
- base applications management ../data-fair/api/src/base-applications/ (remote hosting of webapps will be replaced)
- a recent service of the data-fair stack for reference ../agents
- dual backend files storage ../data-fair/api/src/files-storage/

Versions management:

- semver aware, including prerelease support (e.g. 1.2.0-beta.1)
- when downloading it is possible to use either 1.1.0 or 1.1 or 1
- evergreen, keep only the current and previous tarball per minor branch (2-deep retention, prevents ever-growing storage while allowing rollback)
- metadata (description, thumbnails, etc) is managed per major version

Content of artefacts:

- non-editable metadatas coming from the loaded manifests (package name, version, licence, category of resource)
- additional editable metadatas (i18n title and description, thumbnail)
- tarballs similar to npm modules (package.json used as universal manifest format, list of included files, etc) but includes bundled node_modules folder if there are dependencies
- 1 tarball per version and in some cases per architecture (only for packages with native node bindings, e.g. sharp, sqlite3)
- uniform base schema for all resource categories + category-specific fields
- upload validation: trust the uploader (superadmin API keys = trusted CI pipelines)

Storage:

- metadata stored in MongoDB
- tarballs stored using a dual backend (filesystem / S3), reusing the data-fair files-storage pattern for cloud/on-prem flexibility

Access control:

- superadmin (user.adminMode = true) can perform all CRUD operations and access a admin page listing all the content of the registry
- superadmins can define "public" and "privateAccess" properties to control who can use the artefacts
- accounts (users or organizations) can use the API to list the ressources they can use (but not download them directly)
- services that rely on the plugins use an internal secret (use assertReqInternalSecret utility) to download the tarballs. They join the contextual account (in headers or query params) to check privateAccess
- superadmins can grant access to the registry to an account. When access is granted the account members can not only list the resources they can use, they can also download them
- accounts with granted access can manage api keys (allowing for registry federation)
- superadmins can create special api keys for upload of artefacts
- access control is additive: granted access enables download capability, but only for artifacts where public=true OR the account is in privateAccess

How services use the artefacts:

- they download the artefact using the internal secret in the context of a task for an account
- they extract the tarball in a temporary folder
- the 2 prior items should manage caching optimization: the client queries the registry for the resolved latest version and compares to the locally stored version string before downloading
- sometimes the extracted folders will contain resources (tileserver data, built dataviz), sometimes it will be a node module with bundled dependencies
- this functionality will be implemented in a small npm module in a workspace inside this project (folder lib-node distributed on npm as @data-fair/lib-node-registry)

How artefacts are uploaded:

- directly connected to github or gitlab CI using a upload API key created by a superadmin
- new artefacts are private by default and lacking many metadata (curation work by superadmins before opening permissions)
- no explicit lifecycle states (draft/published/deprecated) — private by default is sufficient, beta versions use semver prerelease notation

UI:

- admin management pages (superadmins: full CRUD, registry content overview)
- account-facing browsing and download pages (users see resources they have access to)

Migration:

- out of scope for this repository
- both old (catalogs/processings plugins, base-applications) and new systems will run side by side during an undetermined transition period
- CI pipelines will be reconfigured to upload to the registry, manual curation work will be done
- old systems will be deprecated after transition is complete

Advanced use-cases:

- federation of registries
- integration with vulnerability scanners
- these will be implemented as a following step, just make sure the architecture will allow it efficiently
- for federation: artifact identity should include a registry origin, metadata should support upstream source tracking, API should anticipate proxying