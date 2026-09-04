<#
=============================================================================
 DIAGNOSTIC DE LA PASSERELLE — sept contrôles, aucune modification
=============================================================================

 Ce script NE MODIFIE RIEN. Chaque échec porte la manœuvre qui le corrige.

   1. la passerelle répond ;
   2. la clé d'API est acceptée ;
   3. l'instance existe et la session est connectée ;
   4. le webhook est déclaré vers le BON domaine ;
   5. l'endpoint webhook de l'application répond 401 SANS jeton ;
   6. le jeton enregistré est RÉELLEMENT celui qu'attend l'application
      (contrôle actif : on rejoue un appel authentifié sur un ÉVÈNEMENT INCONNU
      que la route ignore — rien n'est écrit, seule l'authentification est
      éprouvée) ;
   7. la clé du nœud n'expire pas.

 ⚠️ LE FAUX POSITIF À CONNAÎTRE : depuis ce poste et depuis tout membre du
 tailnet, la résolution passe par l'IP interne et RÉUSSIT même si le chemin
 public est mort. Le seul test qui tranche vient d'un réseau tiers.

 Usage :  pwsh ./check-gateway.ps1 -AppUrl https://mon-club.vercel.app
=============================================================================
#>

param(
  # L'adresse PUBLIQUE de l'application déployée. Sans elle, les contrôles 5 et
  # 6 sont sautés — ils portent sur l'application, pas sur la passerelle.
  [string]$AppUrl = ""
)

$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

function Say([string]$t, [string]$c = "Gray") { Write-Host $t -ForegroundColor $c }
function Ok  ([string]$t) { Say "  [OK]   $t" "Green" }
function Warn([string]$t) { Say "  [!]    $t" "Yellow" }
function Bad ([string]$t) { Say "  [X]    $t" "Red" }
function Fix ([string]$t) { Say "         -> $t" "Yellow" }

if (-not (Test-Path ".env")) { Bad "Aucun .env. Rien a diagnostiquer."; exit 1 }

$env_map = @{}
foreach ($line in Get-Content ".env") {
  if ($line -match '^\s*#') { continue }
  if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)$') { $env_map[$Matches[1]] = $Matches[2].Trim() }
}
$base     = $env_map["TUNNEL_PUBLIC_URL"].TrimEnd('/')
$apiKey   = $env_map["EVOLUTION_API_KEY"]
$instance = if ($env_map["EVOLUTION_INSTANCE"]) { $env_map["EVOLUTION_INSTANCE"] } else { "adiyet" }

Say "`n=== Diagnostic de la passerelle ===" "Cyan"
Say "  Passerelle : $base"
Say "  Instance   : $instance`n"

# -----------------------------------------------------------------------------
#  1. La passerelle répond
# -----------------------------------------------------------------------------
$reachable = $false
try {
  $r = Invoke-WebRequest -Uri "$base/" -TimeoutSec 20 -SkipHttpErrorCheck
  $reachable = $true
  Ok "1. La passerelle repond (HTTP $($r.StatusCode))"
} catch {
  Bad "1. La passerelle ne repond pas : $($_.Exception.Message)"
  Fix "Poste allume ? Docker lance ? `docker compose -f docker-compose.funnel.yml ps`"
  Fix "Funnel accorde ? `pwsh ./start-gateway.ps1` le verifie."
}

# -----------------------------------------------------------------------------
#  2. La clé d'API est acceptée
# -----------------------------------------------------------------------------
$instances = $null
if ($reachable) {
  try {
    $instances = Invoke-RestMethod -Uri "$base/instance/fetchInstances" `
      -Headers @{ apikey = $apiKey } -TimeoutSec 20
    Ok "2. La cle d'API est acceptee"
  } catch {
    Bad "2. La cle d'API est REFUSEE : $($_.Exception.Message)"
    Fix "EVOLUTION_API_KEY (application) doit valoir EXACTEMENT AUTHENTICATION_API_KEY (conteneur)."
  }
}

# -----------------------------------------------------------------------------
#  3. L'instance existe, et la session est connectée
# -----------------------------------------------------------------------------
$connected = $false
if ($instances) {
  $row = $instances | ForEach-Object { if ($_.instance) { $_.instance } else { $_ } } |
         Where-Object { $_.instanceName -eq $instance -or $_.name -eq $instance }
  if (-not $row) {
    Bad "3. L'instance « $instance » n'existe pas sur la passerelle."
    Fix "Reglages -> WhatsApp -> « Initialiser l'instance »."
  } else {
    $state = if ($row.connectionStatus) { $row.connectionStatus } else { $row.status }
    if ($state -eq "open") {
      $connected = $true
      Ok "3. Session CONNECTEE (numero lie : $($row.ownerJid))"
    } else {
      Warn "3. L'instance existe mais la session est « $state »."
      Fix "Reglages -> WhatsApp -> « Afficher le QR », puis scannez-le."
    }
  }
}

# -----------------------------------------------------------------------------
#  4. Le webhook est déclaré vers le BON domaine
# -----------------------------------------------------------------------------
$hook = $null
if ($connected -or $instances) {
  try {
    $hook = Invoke-RestMethod -Uri "$base/webhook/find/$instance" `
      -Headers @{ apikey = $apiKey } -TimeoutSec 20
  } catch { $hook = $null }

  $hookUrl = if ($hook.webhook) { $hook.webhook.url } else { $hook.url }
  if (-not $hookUrl) {
    Bad "4. AUCUN webhook enregistre. Les messages partiront, mais aucun accuse"
    Say "         de remise ne reviendra — et rien ne le signalera." "Red"
    Fix "Reglages -> WhatsApp -> « Reenregistrer le webhook »."
  } elseif ($hookUrl -match "localhost|127\.0\.0\.1|host\.docker\.internal") {
    Bad "4. Le webhook pointe vers une adresse LOCALE : $hookUrl"
    Fix "C'est un .env recopie en bloc. Reenregistrez le webhook DEPUIS LE SITE DEPLOYE."
  } else {
    Ok "4. Webhook declare vers : $hookUrl"
    if ($AppUrl -and ($hookUrl -notlike "$($AppUrl.TrimEnd('/'))*")) {
      Warn "   ...mais PAS vers $AppUrl. Adresse PERIMEE (ancien domaine ?)."
      Fix "Reglages -> WhatsApp -> « Reenregistrer le webhook »."
    }
  }
}

# -----------------------------------------------------------------------------
#  5 & 6. L'endpoint de l'application : 401 sans jeton, et jeton identique
# -----------------------------------------------------------------------------
if ($AppUrl) {
  $endpoint = "$($AppUrl.TrimEnd('/'))/api/whatsapp/webhook"

  try {
    $r = Invoke-WebRequest -Uri $endpoint -Method Post -Body "{}" `
      -ContentType "application/json" -TimeoutSec 20 -SkipHttpErrorCheck
    if ($r.StatusCode -eq 401) {
      Ok "5. L'endpoint webhook repond 401 SANS jeton (c'est ce qu'il doit faire)"
    } else {
      Bad "5. L'endpoint repond $($r.StatusCode) sans jeton — il devrait repondre 401."
      Fix "EVOLUTION_WEBHOOK_TOKEN est-elle posee chez l'hebergeur ? Avez-vous REDEPLOYE ?"
    }
  } catch {
    Bad "5. L'endpoint webhook est injoignable : $($_.Exception.Message)"
  }

  # LE CONTRÔLE ACTIF : un évènement INCONNU, que la route accepte et ignore.
  # Rien n'est écrit ; seule l'authentification est éprouvée.
  $token = $env_map["EVOLUTION_WEBHOOK_TOKEN"]
  if ($token) {
    try {
      $body = @{ event = "diagnostic.ping"; server_url = $base } | ConvertTo-Json
      $r = Invoke-WebRequest -Uri $endpoint -Method Post -Body $body `
        -ContentType "application/json" `
        -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 20 -SkipHttpErrorCheck
      if ($r.StatusCode -eq 200) {
        Ok "6. Le jeton est RELLEMENT accepte par l'application"
      } elseif ($r.StatusCode -eq 401) {
        Bad "6. JETON DIVERGENT : l'application refuse celui-ci."
        Fix "Les messages partiraient, les accuses reviendraient en 401, et l'ecran"
        Fix "afficherait « prete ». Reenregistrez le webhook."
      } elseif ($r.StatusCode -eq 403) {
        Bad "6. server_url INATTENDU : l'application attend une autre adresse de passerelle."
        Fix "TUNNEL_PUBLIC_URL et EVOLUTION_BASE_URL doivent etre identiques AU CARACTERE PRES."
      } else {
        Warn "6. Reponse inattendue : $($r.StatusCode)"
      }
    } catch {
      Warn "6. Controle actif impossible : $($_.Exception.Message)"
    }
  } else {
    Warn "6. EVOLUTION_WEBHOOK_TOKEN absente du .env local : controle actif saute."
    Say  "         (Elle vit normalement chez l'hebergeur ; l'ajouter ici sert au diagnostic.)"
  }
} else {
  Warn "5-6. Sautes : relancez avec  -AppUrl https://votre-site"
}

# -----------------------------------------------------------------------------
#  7. L'expiration de la clé du nœud
# -----------------------------------------------------------------------------
$status_json = docker exec adiyet-wa-tailscale tailscale status --json 2>$null
if ($status_json) {
  $status = $status_json | ConvertFrom-Json
  if ($status.Self.KeyExpiry) {
    Bad "7. La cle du noeud EXPIRE le $($status.Self.KeyExpiry)."
    Fix "Sans ce clic, le noeud se deconnectera et LES ENVOIS S'ARRETERONT SANS"
    Fix "AUCUN AVERTISSEMENT. Tailscale -> Machines -> le noeud -> « Disable key expiry »."
  } else {
    Ok "7. La cle du noeud n'expire pas"
  }
} else {
  Warn "7. Conteneur Tailscale injoignable : expiration de cle non verifiee."
}

Say "`n  ⚠️ RAPPEL : ce diagnostic tourne DEPUIS LE POSTE. La resolution y passe par" "Yellow"
Say "     l'IP interne et reussit meme si le chemin public est mort. Le seul test" "Yellow"
Say "     qui tranche vient d'un reseau tiers.`n" "Yellow"
