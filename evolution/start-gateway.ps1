<#
=============================================================================
 DÉMARRER LA PASSERELLE — et vérifier les deux pannes qui RESSEMBLENT à une
 réussite
=============================================================================

 Ce script refuse de toucher au moteur de conteneurs tant que le `.env` est
 incomplet, EN NOMMANT la ligne manquante. Puis il démarre, et contrôle :

   1. LE NOM DE NŒUD SUFFIXÉ (`<nom>-1`) — Tailscale n'attribue jamais deux fois
      le même nom. Si un ancien nœud le porte encore, le nouveau en reçoit un
      autre et l'ADRESSE PUBLIQUE CHANGE. Tout démarre, tout paraît normal, et
      plus rien n'arrive.

   2. LE FUNNEL NON ACCORDÉ par les ACL — sans l'attribut `funnel`, le conteneur
      démarre, OBTIENT MÊME SON CERTIFICAT TLS, et affiche « Funnel on: https://… ».
      Cet affichage vient du fichier local. Le plan de contrôle, lui, refuse
      silencieusement de publier le DNS public.

      ⚠️ SEULE VÉRIFICATION QUI FASSE FOI : `tailscale status --json` doit
      contenir `funnel` ET `funnel-ports`. `tailscale funnel status` MENT.

 Usage :  pwsh ./start-gateway.ps1
=============================================================================
#>

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Say([string]$text, [string]$color = "Gray") { Write-Host $text -ForegroundColor $color }
function Ok  ([string]$text) { Say "  [OK]   $text" "Green" }
function Warn([string]$text) { Say "  [!]    $text" "Yellow" }
function Bad ([string]$text) { Say "  [X]    $text" "Red" }

Say "`n=== Passerelle WhatsApp — demarrage ===`n" "Cyan"

# -----------------------------------------------------------------------------
#  1. Le .env, ligne par ligne — on NOMME ce qui manque
# -----------------------------------------------------------------------------
if (-not (Test-Path ".env")) {
  Bad "Le fichier .env n'existe pas."
  Say "         Copiez .env.example en .env et remplissez les cinq valeurs."
  exit 1
}

$required = @(
  "TAILSCALE_AUTHKEY",
  "TAILSCALE_HOSTNAME",
  "TUNNEL_PUBLIC_URL",
  "EVOLUTION_API_KEY",
  "POSTGRES_PASSWORD"
)

$env_map = @{}
foreach ($line in Get-Content ".env") {
  if ($line -match '^\s*#') { continue }
  if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)$') { $env_map[$Matches[1]] = $Matches[2].Trim() }
}

$missing = @()
foreach ($key in $required) {
  $value = $env_map[$key]
  # Une variable posée mais VIDE, ou laissée à sa valeur d'exemple, vaut absente.
  if ([string]::IsNullOrWhiteSpace($value) -or $value -like "*changez-moi*" -or $value -like "*xxxxxxxx*" -or $value -like "*votre-tailnet*") {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  Bad "Le fichier .env est incomplet. Renseignez :"
  foreach ($key in $missing) { Say "           - $key" "Red" }
  Say "`n         Rien n'a ete demarre : un montage a moitie configure est plus" "Yellow"
  Say "         difficile a diagnostiquer qu'un montage arrete.`n" "Yellow"
  exit 1
}
Ok ".env complet"

$expected_host = $env_map["TAILSCALE_HOSTNAME"]
$public_url    = $env_map["TUNNEL_PUBLIC_URL"].TrimEnd('/')

if ($env_map["TUNNEL_PUBLIC_URL"] -ne $public_url) {
  Warn "TUNNEL_PUBLIC_URL porte un slash final. Il DOIT etre retire : l'application"
  Say  "         compare cette adresse au caractere pres, et un slash de trop fait"
  Say  "         refuser TOUS les accuses de remise en 403."
}

# -----------------------------------------------------------------------------
#  2. Le moteur de conteneurs
# -----------------------------------------------------------------------------
try { docker version --format '{{.Server.Version}}' | Out-Null }
catch {
  Bad "Docker ne repond pas. Lancez Docker Desktop, puis reessayez."
  exit 1
}
Ok "Docker repond"

# -----------------------------------------------------------------------------
#  3. Un autre montage monte-t-il NOS volumes ?
# -----------------------------------------------------------------------------
#  Le danger n'est PAS qu'une autre passerelle tourne sur le poste — la
#  cohabitation est saine. Le danger est qu'un autre conteneur monte NOS volumes.
#  On compare donc les VOLUMES, pas les noms.
#
#  ⚠️ AUCUN GUILLEMET INTERNE DANS LE GABARIT : sous Windows, docker.exe
#  reanalyse ses arguments et AVALE les guillemets doubles. Un gabarit ampute
#  fait echouer le moteur de gabarit, chaque conteneur est ignore, et le
#  controle annonce « rien a signaler » SANS AVOIR RIEN REGARDE.
$ours = @("adiyet-wa_evolution_instances", "adiyet-wa_evolution_pgdata", "adiyet-wa_tailscale_state")
$intruders = @()
$ids = docker ps -q
if ($ids) {
  foreach ($id in $ids) {
    $name = (docker inspect --format '{{.Name}}' $id).Trim('/')
    if ($name -like "adiyet-wa-*") { continue }
    $mounts = docker inspect --format '{{range .Mounts}}{{.Name}} {{end}}' $id
    foreach ($v in $ours) {
      if ($mounts -match [regex]::Escape($v)) { $intruders += "$name -> $v" }
    }
  }
  Ok "Montages concurrents : $($ids.Count) conteneur(s) examine(s)"
} else {
  Ok "Montages concurrents : aucun conteneur en cours"
}
if ($intruders.Count -gt 0) {
  Bad "Un autre montage utilise NOS volumes :"
  foreach ($i in $intruders) { Say "           $i" "Red" }
  exit 1
}

# -----------------------------------------------------------------------------
#  4. Démarrage
# -----------------------------------------------------------------------------
Say "`n--- docker compose up -d ---`n" "Cyan"
docker compose -f docker-compose.funnel.yml up -d
if ($LASTEXITCODE -ne 0) { Bad "Le demarrage a echoue."; exit 1 }

Say "`n--- Verifications ---`n" "Cyan"
Start-Sleep -Seconds 12

# -----------------------------------------------------------------------------
#  5. PANNE N°1 — le nom de nœud suffixé
# -----------------------------------------------------------------------------
$status_json = docker exec adiyet-wa-tailscale tailscale status --json 2>$null
if (-not $status_json) {
  Warn "Tailscale n'a pas encore repondu. Relancez ce script dans une minute."
} else {
  $status = $status_json | ConvertFrom-Json
  $dns = $status.Self.DNSName
  $actual = ($dns -split '\.')[0]

  if ($actual -eq $expected_host) {
    Ok "Nom du noeud : $actual (celui qui etait attendu)"
  } else {
    Bad "NOM DE NOEUD INATTENDU : « $actual » au lieu de « $expected_host »."
    Say "         Tailscale n'attribue jamais deux fois le meme nom : un ancien noeud" "Red"
    Say "         le porte encore. L'ADRESSE PUBLIQUE N'EST PLUS CELLE DECLAREE." "Red"
    Say "         Correction : Tailscale -> Machines -> supprimer l'ancien noeud," "Yellow"
    Say "         puis  docker compose -f docker-compose.funnel.yml up -d --force-recreate tailscale" "Yellow"
  }

  # ---------------------------------------------------------------------------
  #  6. PANNE N°2 — le Funnel non accordé par les ACL
  # ---------------------------------------------------------------------------
  #  `tailscale funnel status` MENT : il lit le fichier local, pas le plan de
  #  controle. Seul `status --json` fait foi.
  $caps = @()
  if ($status.Self.Capabilities) { $caps += $status.Self.Capabilities }
  if ($status.Self.CapMap)       { $caps += $status.Self.CapMap.PSObject.Properties.Name }
  $flat = ($caps -join " ")

  if ($flat -match "funnel" -and $flat -match "funnel-ports") {
    Ok "Funnel accorde par les ACL (funnel + funnel-ports presents)"
  } else {
    Bad "LE FUNNEL N'EST PAS ACCORDE. Le conteneur demarre, obtient meme son"
    Say "         certificat TLS et affiche « Funnel on: … » — cet affichage vient du" "Red"
    Say "         fichier local. Le plan de controle refuse de publier le DNS public." "Red"
    Say "         Correction : Tailscale -> Access controls, AJOUTER A L'INTERIEUR de" "Yellow"
    Say "         la politique existante (le fichier n'accepte QU'UN objet de haut niveau) :" "Yellow"
    Say '           "nodeAttrs": [ { "target": ["autogroup:member"], "attr": ["funnel"] } ]' "Yellow"
  }
}

Say "`n--- Adresse publique ---`n" "Cyan"
Say "  $public_url"
Say "`n  ⚠️ Un test DEPUIS CE POSTE ne prouve rien : la resolution passe par l'IP" "Yellow"
Say "     interne et reussit meme si le chemin public est mort. Le seul test qui" "Yellow"
Say "     tranche vient d'un RESEAU TIERS (un telephone en donnees mobiles).`n" "Yellow"
Say "  Diagnostic complet :  pwsh ./check-gateway.ps1`n" "Cyan"
