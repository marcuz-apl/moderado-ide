Name:           moderado-ide
Version:        0.1.22
Release:        261007a
Summary:        Provider-independent agent hosted in an IDE
License:        MIT
URL:            https://moderado.dev
Packager:       Moderado <maintainers@moderado.dev>
BuildArch:      x86_64
ExclusiveArch:  x86_64

Requires:       ca-certificates, xdg-utils, dejavu-sans-fonts

# Electron and its native modules are already built for the pinned ABI.
# Preserve them and the sandbox permissions during system packaging.
%global __os_install_post %{nil}
%global debug_package %{nil}
# Upstream bundles cross-platform utilities which are unused on Linux x64.
%global __requires_exclude_from /(linux-(arm|arm64|ppc64|s390x|riscv64)/|bin/arm64/)
# Private Electron libraries must not satisfy other system packages.
%global __provides_exclude_from ^/opt/moderado-ide/
%global __requires_exclude ^lib(ffmpeg|msalruntime)[.]so

%description
Moderado IDE is a provider-independent agent that lives inside an IDE,
with Gateway access, model routing, and policy tooling.

This package ships a locally-packaged, portable Linux build of the
Moderado editor. The graphical client is built from the pinned VSCodium
(open-vscode) source tree; no telemetry, no Microsoft branding.




%prep

%install
rm -rf $RPM_BUILD_ROOT
mkdir -p $RPM_BUILD_ROOT/opt/moderado-ide
cp -a ./VSCode-linux-x64/. $RPM_BUILD_ROOT/opt/moderado-ide/
mkdir -p $RPM_BUILD_ROOT/usr/bin
ln -sf /opt/moderado-ide/bin/moderado-ide $RPM_BUILD_ROOT/usr/bin/moderado-ide
mkdir -p $RPM_BUILD_ROOT/usr/share/applications
cp %{_builddir}/moderado-ide.desktop $RPM_BUILD_ROOT/usr/share/applications/
mkdir -p $RPM_BUILD_ROOT/usr/share/metainfo
cp %{_builddir}/moderado-ide.appdata.xml $RPM_BUILD_ROOT/usr/share/metainfo/
mkdir -p $RPM_BUILD_ROOT/usr/share/icons/hicolor/scalable/apps
cp %{_builddir}/moderado-ide.svg $RPM_BUILD_ROOT/usr/share/icons/hicolor/scalable/apps/
mkdir -p $RPM_BUILD_ROOT/usr/share/doc/moderado-ide
cp LICENSE $RPM_BUILD_ROOT/usr/share/doc/moderado-ide/LICENSE
cp README.md $RPM_BUILD_ROOT/usr/share/doc/moderado-ide/README.md

%files
%defattr(-,root,root,-)
/opt/moderado-ide
/usr/bin/moderado-ide
/usr/share/applications/moderado-ide.desktop
/usr/share/metainfo/moderado-ide.appdata.xml
/usr/share/icons/hicolor/scalable/apps/moderado-ide.svg
%license /usr/share/doc/moderado-ide/LICENSE
%doc /usr/share/doc/moderado-ide/README.md


%changelog
* Wed Oct 07 2026 Moderado <maintainers@moderado.dev> - 0.1.22-261007a
- Initial Linux packaging.
