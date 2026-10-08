Name:           moderado-ide
Version:        0.1.22
Release:        261007a
Summary:        Provider-independent agent hosted in an IDE
License:        MIT
URL:            https://moderado.dev
Packager:       Moderado <maintainers@moderado.dev>
BuildArch:      x86_64
ExclusiveArch:  x86_64

Requires:       ca-certificates, libc6 (>= 2.14), libgcc1 | libgcc-s1,
                libglib2.0-0, libnss3, libpcre2-8-0, libstdc++6,
                libx11-xcb1, libxcomposite1, libxcursor1, libxdamage1,
                libxext6, libxfixes3, libxkbcommon0, libxrandr2, libpango-1.0-0,
                libcairo2, libasound2, libatspi2.0-0, libcups2, libdrm2,
                libgbm1, libgl1, libgles2, libgtk-3-0, libxshmfence1,
                libdbus-1-3, libsecret-1-0, fonts-dejavu-core

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
ln -sf /opt/moderado-ide/moderado-ide $RPM_BUILD_ROOT/usr/bin/moderado-ide
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
%doc /usr/share/doc/moderado-ide/LICENSE /usr/share/doc/moderado-ide/README.md


%changelog
* Tue Oct 07 2026 Moderado <maintainers@moderado.dev> - 0.1.22-261007a
- Initial Linux packaging.
