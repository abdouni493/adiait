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

 Usage :  ./check-gateway.ps1 -AppUrl https://mon-club.vercel.app

 Fonctionne sur Windows PowerShell 5.1 comme sur PowerShell 7 : les appels HTTP
 passent par `Invoke-Http`, qui rend le code de statut dans les deux cas.
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

<#
  UN APPEL HTTP QUI REND SON CODE DE STATUT SUR LES DEUX POWERSHELL.

  `-SkipHttpErrorCheck` n'existe qu'à partir de PowerShell 7 ; sous Windows
  PowerShell 5.1 — celui qui est installé par défaut, donc celui sur lequel ce
  script tournera le plus souvent — un 401 lève une exception au lieu de rendre
  une réponse. Or c'est précisément le 401 que ce diagnostic doit LIRE : sans
  cette enveloppe, le contrôle qui vérifie que l'endpoint refuse bien les appels
  sans jeton échouerait en annonçant une panne là où tout va bien.

  Rend $null quand la requête n'a même pas abouti (hôte injoignable), et
  l'appelant distingue alors « pas de réponse » de « réponse en erreur ».
#>
function Invoke-Http {
  param(
    [string]$Uri,
    [string]$Method = "Get",
    $Headers = @{},
    [string]$Body = $null,
    # 45 s, ET NON 20. La PREMIERE poignee de main TLS a travers le Funnel
    # est lente quand le chemin public vient d'etre etabli : a 20 s, le
    # diagnostic annoncait « la passerelle ne repond pas » sur une passerelle
    # qui repondait tres bien. Un faux signalement apprend a ignorer le
    # rapport — c'est le pire defaut qu'un diagnostic puisse avoir.
    [int]$TimeoutSec = 45
  )
  # PAS `$args` : c'est une variable AUTOMATIQUE de PowerShell (les arguments de
  # la fonction). L'ecraser marche, jusqu'au jour ou cela ne marche plus.
  $req = @{ Uri = $Uri; Method = $Method; Headers = $Headers; TimeoutSec = $TimeoutSec; UseBasicParsing = $true }
  if ($Body) { $req.Body = $Body; $req.ContentType = "application/json" }
  try {
    $r = Invoke-WebRequest @req
    return [pscustomobject]@{ StatusCode = [int]$r.StatusCode; Content = $r.Content; Failed = $false }
  } catch {
    $resp = $_.Exception.Response
    if ($resp -and $resp.StatusCode) {
      # Une reponse, meme en erreur, PROUVE que l'hote est joignable.
      return [pscustomobject]@{ StatusCode = [int]$resp.StatusCode; Content = ""; Failed = $false }
    }
    return [pscustomobject]@{ StatusCode = 0; Content = ""; Failed = $true; Error = $_.Exception.Message }
  }
}

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
$r = Invoke-Http -Uri "$base/"
if (-not $r.Failed) {
  $reachable = $true
  Ok "1. La passerelle repond (HTTP $($r.StatusCode))"
} else {
  Bad "1. La passerelle ne repond pas : $($r.Error)"
  Fix "Poste allume ? Docker lance ?  docker compose -f docker-compose.funnel.yml ps"
  Fix "Funnel accorde ?  ./start-gateway.ps1  le verifie."
}

# -----------------------------------------------------------------------------
#  2. La clé d'API est acceptée
# -----------------------------------------------------------------------------
#  ⚠️ ON RETIENT LE VERDICT, PAS SEULEMENT LA LISTE.
#
#  Une passerelle neuve rend une liste VIDE, et PowerShell tient un tableau vide
#  pour faux : brancher les contrôles suivants sur `if ($instances)` les faisait
#  sauter EN SILENCE — le rapport annonçait « rien à signaler » sur des contrôles
#  qu'il n'avait pas faits. Un diagnostic muet est pire qu'un diagnostic qui
#  échoue : on le croit.
$instances = @()
$apiOk = $false
if ($reachable) {
  try {
    $raw = Invoke-RestMethod -Uri "$base/instance/fetchInstances" `
      -Headers @{ apikey = $apiKey } -TimeoutSec 45
    if ($null -ne $raw) { $instances = @($raw) }
    $apiOk = $true
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
$instanceExists = $false
if ($apiOk) {
  $row = $instances | ForEach-Object { if ($_.instance) { $_.instance } else { $_ } } |
         Where-Object { $_.instanceName -eq $instance -or $_.name -eq $instance }
  if (-not $row) {
    Warn "3. L'instance « $instance » n'existe pas encore sur la passerelle."
    Fix "C'est l'etat normal avant la mise en service."
    Fix "Reglages -> WhatsApp -> « Initialiser l'instance »."
  } else {
    $instanceExists = $true
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
#  Le webhook vit SUR l'instance : sans instance, il n'y a rien à relire — et on
#  le DIT, plutôt que de sauter le contrôle sans un mot.
$hook = $null
if ($apiOk -and -not $instanceExists) {
  Warn "4. Pas d'instance : aucun webhook a relire."
  Fix "Il sera enregistre par « Initialiser l'instance », depuis le SITE DEPLOYE."
}
if ($instanceExists) {
  try {
    $hook = Invoke-RestMethod -Uri "$base/webhook/find/$instance" `
      -Headers @{ apikey = $apiKey } -TimeoutSec 45
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

  $r = Invoke-Http -Uri $endpoint -Method Post -Body "{}"
  if ($r.Failed) {
    Bad "5. L'endpoint webhook est injoignable : $($r.Error)"
  } elseif ($r.StatusCode -eq 401) {
    Ok "5. L'endpoint webhook repond 401 SANS jeton (c'est ce qu'il doit faire)"
  } else {
    Bad "5. L'endpoint repond $($r.StatusCode) sans jeton -- il devrait repondre 401."
    Fix "EVOLUTION_WEBHOOK_TOKEN est-elle posee chez l'hebergeur ? Avez-vous REDEPLOYE ?"
  }

  # LE CONTRÔLE ACTIF : un évènement INCONNU, que la route accepte et ignore.
  # Rien n'est écrit ; seule l'authentification est éprouvée.
  $token = $env_map["EVOLUTION_WEBHOOK_TOKEN"]
  if ($token) {
    $body = @{ event = "diagnostic.ping"; server_url = $base } | ConvertTo-Json
    $r = Invoke-Http -Uri $endpoint -Method Post -Body $body -Headers @{ Authorization = "Bearer $token" }
    if ($r.Failed) {
      Warn "6. Controle actif impossible : $($r.Error)"
    } elseif ($r.StatusCode -eq 200) {
      Ok "6. Le jeton est REELLEMENT accepte par l'application"
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
