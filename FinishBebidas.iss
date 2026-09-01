; Script do Inno Setup para o sistema Finish Bebidas
; Desenvolvido por Antigravity para Finish Bebidas

[Setup]
AppName=Finish Bebidas
AppVersion=1.0.0
AppPublisher=Finish Bebidas
DefaultDirName=C:\FinishBebidas
DefaultGroupName=Finish Bebidas
DisableProgramGroupPage=yes
; Local onde o instalador compilado será salvo (.exe final)
OutputDir=dist
OutputBaseFilename=FinishBebidas_Instalador
Compression=lzma2
SolidCompression=yes
SetupIconFile=Icone.ico
WizardStyle=modern

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Código do Backend (FastAPI)
Source: "app\*"; DestDir: "{app}\app"; Flags: recursesubdirs createallsubdirs ignoreversion

; Código do Frontend (HTML, CSS, JS)
Source: "frontend\*"; DestDir: "{app}\frontend"; Flags: recursesubdirs createallsubdirs ignoreversion

; Arquivo de dependências e script de inicialização
Source: "requirements.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "INICIAR.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "Icone.ico"; DestDir: "{app}"; Flags: ignoreversion

; Python Embutido (Standalone)
Source: "python-embed\*"; DestDir: "{app}\python-embed"; Flags: recursesubdirs createallsubdirs ignoreversion


; Banco de dados SQLite local
; IMPORTANTE: Flags 'onlyifdoesntexist' e 'uninsneveruninstall' garantem que atualizações do sistema NUNCA apaguem as vendas/produtos do cliente.
; 'Permissions: users-modify' garante que o banco de dados possa ser editado sem problemas de permissão do Windows.
Source: "data\mercado.db"; DestDir: "{app}\data"; Flags: onlyifdoesntexist uninsneveruninstall; Permissions: users-modify

[Icons]
Name: "{group}\Finish Bebidas"; Filename: "{app}\INICIAR.bat"; IconFilename: "{app}\Icone.ico"
Name: "{group}\{cm:UninstallProgram,Finish Bebidas}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Finish Bebidas"; Filename: "{app}\INICIAR.bat"; Tasks: desktopicon; IconFilename: "{app}\Icone.ico"

[Run]
Filename: "{app}\INICIAR.bat"; Description: "Iniciar o sistema Finish Bebidas agora"; Flags: postinstall shellexec nowait
