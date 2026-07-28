## ADDED Requirements

### Requirement: reeboot install installs a pi-compatible package into ~/.reeboot/
`reeboot install npm:<package>[@version]` SHALL run `npm install --prefix ~/.reeboot/packages <package>` and then append the package identifier to `config.extensions.packages`. `reeboot install git:<repo>` and `reeboot install <local-path>` SHALL also be supported. After install, user is told to run `reeboot reload` to activate extensions.

#### Scenario: npm package is installed
- **WHEN** `reeboot install npm:reeboot-github-tools` is run
- **THEN** the package is installed to `~/.reeboot/packages/` and its identifier is added to `config.extensions.packages`

#### Scenario: User is prompted to reload after install
- **WHEN** install completes
- **THEN** CLI prints "Installed. Run 'reeboot reload' to activate."

#### Scenario: Non-existent npm package reports error
- **WHEN** `reeboot install npm:does-not-exist-xxxxxx` is run
- **THEN** CLI prints an npm error and exits with non-zero code

### Requirement: reeboot uninstall removes a package
`reeboot uninstall <package-name>` SHALL remove the package from `~/.reeboot/packages/` and remove its entry from `config.extensions.packages`.

#### Scenario: Package is removed
- **WHEN** `reeboot uninstall reeboot-github-tools` is run for an installed package
- **THEN** the package directory is removed and the config entry is deleted

#### Scenario: Uninstalling non-installed package reports error
- **WHEN** `reeboot uninstall package-not-installed` is run
- **THEN** CLI prints "Package not installed: package-not-installed" and exits 1

### Requirement: reeboot packages list shows installed packages
`reeboot packages list` SHALL print a table of installed packages from `config.extensions.packages` with their name and installed version.

#### Scenario: Package list shows installed packages
- **WHEN** `reeboot packages list` is run after installing a package
- **THEN** the installed package appears in the output table
