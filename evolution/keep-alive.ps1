<#
=============================================================================
 METTRE LE POSTE EN SERVICE CONTINU
=============================================================================

 La passerelle ne vaut que si le poste reste allumé. Ce script traite les deux
 réglages qui coupent réellement le service, et se contente de SIGNALER ceux
 qui appartiennent à l'utilisateur.

   1. MISE EN VEILLE ET VEILLE PROLONGÉE → « jamais ». Elles suspendent les
      conteneurs et font tomber la session : c'est la cause n°1 d'un service qui
      « marche la journée et plus le soir ».
   2. DÉMARRAGE AUTOMATIQUE DU MOTEUR DE CONTENEURS. Après une coupure de
      courant, `restart: unless-stopped` ne sert à rien tant que Docker Desktop
      n'est pas lancé.

 IL RAPPORTE PAR DÉFAUT, ET N'AGIT QU'AVEC -Apply.

 ON NE SIGNALE QUE CE QUI CASSE LE SERVICE. L'arrêt des disques inactifs, par
 exemple, avait été signalé à tort : le disque se réveille au premier accès,
 cela ne coupe rien. Un faux signalement apprend à ignorer le rapport.

 Usage :  pwsh ./keep-alive.ps1          (rapport seul)
          pwsh ./keep-alive.ps1 -Apply   (applique)
=============================================================================
#>

param([switch]$Apply)

$ErrorActionPreference = "Continue"

function Say([string]$t, [string]$c = "Gray") { Write-Host $t -ForegroundColor $c }
function Ok  ([string]$t) { Say "  [OK]   $t" "Green" }
function Warn([string]$t) { Say "  [!]    $t" "Yellow" }
function Act ([string]$t) { Say "  [~]    $t" "Cyan" }

Say "`n=== Poste en service continu ===" "Cyan"
if (-not $Apply) { Say "  (rapport seul — relancez avec -Apply pour agir)`n" "Yellow" } else { Say "" }

# -----------------------------------------------------------------------------
#  1. La veille — ce qui casse vraiment le service
# -----------------------------------------------------------------------------
$sleepAc = (powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String "Index actuel de l'alimentation secteur|Current AC Power Setting Index") -join ""
$hibAc   = (powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE | Select-String "Index actuel de l'alimentation secteur|Current AC Power Setting Index") -join ""

if ($sleepAc -match "0x00000000") { Ok "Mise en veille (secteur) : jamais" }
else {
  Warn "Mise en veille (secteur) ACTIVE — elle suspend les conteneurs et fait tomber la session."
  if ($Apply) {
    powercfg /change standby-timeout-ac 0
    powercfg /change monitor-timeout-ac 0
    Act "Mise en veille desactivee (l'ecran peut toujours s'eteindre : cela ne coupe rien)."
  }
}

if ($hibAc -match "0x00000000") { Ok "Veille prolongee (secteur) : jamais" }
else {
  Warn "Veille prolongee (secteur) ACTIVE."
  if ($Apply) {
    powercfg /change hibernate-timeout-ac 0
    Act "Veille prolongee desactivee."
  }
}

# -----------------------------------------------------------------------------
#  2. Le moteur de conteneurs au démarrage
# -----------------------------------------------------------------------------
$startupPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$dockerExe   = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$shortcut    = Join-Path $startupPath "Docker Desktop.lnk"

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$autoRun = $false
try {
  $props = Get-ItemProperty -Path $runKey -ErrorAction Stop
  $autoRun = ($props.PSObject.Properties.Name -contains "Docker Desktop")
} catch { $autoRun = $false }

if ($autoRun -or (Test-Path $shortcut)) {
  Ok "Docker Desktop demarre automatiquement a l'ouverture de session"
} else {
  Warn "Docker Desktop NE demarre PAS automatiquement — apres une coupure de"
  Say  "         courant, `restart: unless-stopped` ne relancera rien."
  if ($Apply) {
    if (Test-Path $dockerExe) {
      $ws = New-Object -ComObject WScript.Shell
      $lnk = $ws.CreateShortcut($shortcut)
      $lnk.TargetPath = $dockerExe
      $lnk.Save()
      Act "Raccourci de demarrage cree : $shortcut"
    } else {
      Warn "Docker Desktop introuvable a l'emplacement attendu. Reglez-le dans"
      Say  "         Docker Desktop -> Settings -> General -> « Start Docker Desktop when you log in »."
    }
  }
}

# -----------------------------------------------------------------------------
#  3. Les conteneurs, et leur politique de redémarrage
# -----------------------------------------------------------------------------
try {
  $ours = @("adiyet-wa-evolution", "adiyet-wa-postgres", "adiyet-wa-tailscale")
  foreach ($name in $ours) {
    $state = docker inspect --format '{{.State.Status}} {{.HostConfig.RestartPolicy.Name}}' $name 2>$null
    if (-not $state) { Warn "Conteneur $name : absent" ; continue }
    $parts = $state.Trim() -split '\s+'
    if ($parts[0] -eq "running" -and $parts[1] -eq "unless-stopped") {
      Ok "Conteneur $name : en marche, redemarrage unless-stopped"
    } else {
      Warn "Conteneur $name : etat « $($parts[0]) », politique « $($parts[1]) »"
    }
  }
} catch {
  Warn "Docker ne repond pas : etat des conteneurs non verifie."
}

# -----------------------------------------------------------------------------
#  4. Ce qui appartient à l'utilisateur — signalé, JAMAIS modifié
# -----------------------------------------------------------------------------
Say "`n  A regler VOUS-MEME, si le poste doit repartir seul apres une coupure :" "Yellow"
Say "    - OUVERTURE DE SESSION AUTOMATIQUE. Sans elle, Windows demarre mais"
Say "      s'arrete a l'ecran de connexion, et rien ne se lance. Elle stocke un"
Say "      mot de passe : c'est votre decision, pas celle d'un script."
Say "    - HEURES D'ACTIVITE DES MISES A JOUR (Parametres -> Windows Update)."
Say "      Un redemarrage automatique a 3 h coupe la passerelle jusqu'au matin.`n"
