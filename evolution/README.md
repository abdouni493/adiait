# La passerelle WhatsApp du club

Les messages partent du **numéro WhatsApp du club**, depuis une passerelle
hébergée sur un poste de l'écurie. Pas de WhatsApp Business API : aucun modèle à
faire approuver, aucun frais par message. Pas de VPS non plus : le poste publie
lui-même son adresse HTTPS à travers un **Funnel Tailscale**.

```
Application (Vercel)  ──HTTPS──►  passerelle Evolution (poste allumé)  ──►  WhatsApp
Application (webhook) ◄──HTTPS──  passerelle Evolution                 ◄──  statuts
```

## La contrepartie, dite franchement

**Poste éteint = aucun message ne part.** Ils ne sont pas perdus — la file
d'attente de l'application les garde et les rejoue toute seule au rallumage —
mais rien ne prévient personne pendant ce temps. C'est le vrai prix de la
gratuité, et il vaut mieux le décider en connaissance de cause que le découvrir.

## Ce que contient ce dossier

| Fichier | Rôle |
| --- | --- |
| `docker-compose.funnel.yml` | La pile : Evolution + Postgres + sidecar Tailscale |
| `tailscale/funnel.json` | La configuration Serve/Funnel. **Aucun commentaire** : Tailscale désérialise ce fichier |
| `.env.example` | Les cinq secrets du poste, avec ce qui se réutilise et ce qui ne se réutilise pas |
| `start-gateway.ps1` | Démarre **et** vérifie les deux pannes qui *ressemblent à une réussite* |
| `check-gateway.ps1` | Diagnostic en sept contrôles ; ne modifie rien |
| `keep-alive.ps1` | Met le poste en service continu (veille, démarrage de Docker) |

---

## Mise en service, dans l'ordre

### 1. Le compte Tailscale (une seule fois, tous projets confondus)

1. Créez un compte gratuit, relevez le **nom du tailnet** dans **DNS**.
2. **DNS → MagicDNS actif**, puis **Enable HTTPS**.
3. **Access controls** — ajoutez `nodeAttrs` **à l'intérieur** de la politique
   existante :

   ```
   "nodeAttrs": [
     { "target": ["autogroup:member"], "attr": ["funnel"] },
   ],
   ```

   ⚠️ Le fichier ne peut contenir **qu'un seul** objet de haut niveau : le coller
   *au-dessus* donne `invalid character '{' after top-level value`. Tailnets
   récents : `grants` ; anciens : `acls` — **jamais les deux**.
   `autogroup:member` couvre **tout** nouveau nœud : cette étape ne se refait pas.

4. **Settings → Keys → Generate auth key**, cochée **Reusable**, **jamais
   Ephemeral**.

### 2. Les secrets du poste

```powershell
cp .env.example .env
# puis remplir les cinq valeurs
```

`TAILSCALE_HOSTNAME` ne se récupère nulle part : **c'est un nom que l'on
choisit**. L'adresse publique vaut `https://` + ce nom + `.` + le nom du tailnet.

### 3. Démarrer

```powershell
pwsh ./start-gateway.ps1
```

Le script refuse de toucher au moteur de conteneurs tant que le `.env` est
incomplet, **en nommant la ligne manquante**, puis contrôle les deux pannes qui
ressemblent à une réussite :

- **le nom de nœud suffixé** (`<nom>-1`) — Tailscale n'attribue jamais deux fois
  le même nom, et l'adresse publique n'est alors plus celle déclarée ;
- **le Funnel non accordé** par les ACL.

  ⚠️ `tailscale funnel status` **ment** : sans l'attribut `funnel`, le conteneur
  démarre, **obtient même son certificat TLS** et affiche `# Funnel on: https://…`
  — cet affichage vient du fichier local. **Seule vérification qui fasse foi** :
  `tailscale status --json` doit contenir `funnel` **et** `funnel-ports`.

### 4. Le poste en service continu

```powershell
pwsh ./keep-alive.ps1          # rapport
pwsh ./keep-alive.ps1 -Apply   # applique
```

### 5. Les variables chez l'hébergeur, **puis redéployer**

Voir la section « Variables d'environnement » du README principal. Elles ne sont
lues **qu'au déploiement** : les poser sans redéployer ne change rien.

⚠️ **Ne définissez PAS `EVOLUTION_WEBHOOK_URL`.** L'adresse du webhook se
**déduit** du domaine sur lequel l'application répond. Recopier un `.env` local
en bloc emporte `http://host.docker.internal:3000`, et la mise en service échoue
sur une 400 muette. L'application écarte désormais toute valeur locale — et la
**nomme** dans son diagnostic — mais autant ne pas la poser.

### 6. Connecter le téléphone

**Depuis le site déployé**, jamais depuis `localhost` :
Réglages → WhatsApp → « Initialiser l'instance », puis « Afficher le QR ».
Sur le téléphone : WhatsApp → **Appareils connectés** → **Connecter un appareil**.

Le badge passe au vert **tout seul** : l'écran sonde tant qu'un QR est affiché.

### 7. ⚠️ Désactiver l'expiration de la clé du nœud

**Tailscale → Machines → le nœud → « Disable key expiry ».**

Sans ce clic, le nœud se déconnecte au bout de quelques mois et **les envois
s'arrêtent sans aucun avertissement**.

---

## Diagnostic

```powershell
pwsh ./check-gateway.ps1 -AppUrl https://votre-site
```

Sept contrôles, aucune modification, et pour chaque échec la manœuvre qui le
corrige.

> **Le faux positif à connaître** : depuis ce poste et depuis tout membre du
> tailnet, la résolution passe par l'IP interne et **réussit même si le chemin
> public est mort**. Le seul test qui tranche vient d'un **réseau tiers** — un
> téléphone en données mobiles.

## Déménager la passerelle sur un autre poste

1. **Supprimez d'abord l'ancien nœud** dans Tailscale → Machines. Tailscale
   n'attribue jamais deux fois le même nom : tant que l'ancien existe, le
   nouveau devient `<nom>-1` et **l'adresse publique change**. Oublier cette
   étape *ressemble* à une réussite.
2. Transportez `.env` à la main — il n'est pas dans le dépôt.
3. Démarrez, puis **réenregistrez le webhook** depuis Réglages → WhatsApp : il
   est stocké **sur la passerelle** et continuerait de pointer vers l'ancienne
   adresse. Les messages partiraient, aucun accusé ne reviendrait, et **aucune
   erreur ne le signalerait**.

## Les pièges, en une liste

| # | Piège | Ce qu'il fait |
| --- | --- | --- |
| 1 | `SERVER_URL` ≠ `EVOLUTION_BASE_URL` (un slash) | Tous les accusés refusés en 403 |
| 2 | Volume d'état Tailscale absent | L'adresse publique change à chaque démarrage |
| 3 | Webhook non réenregistré après déménagement | Messages partis, aucun accusé, aucune erreur |
| 4 | Fichier `funnel.json` monté seul (au lieu du dossier) | Le conteneur ne voit pas les modifications |
| 5 | Commentaire dans `funnel.json` | Tailscale ne le désérialise plus |
| 6 | `tailscale funnel status` cru sur parole | Le Funnel n'est pas publié, tout paraît normal |
| 7 | Mot de passe Postgres modifié après coup | La base rejette la connexion, la passerelle ne démarre plus |
| 8 | Expiration de clé non désactivée | Les envois s'arrêtent au bout de quelques mois, sans alerte |
| 9 | Poste en veille | « Ça marche la journée et plus le soir » |
| 10 | `EVOLUTION_WEBHOOK_URL` posée | Écartée par l'application — mais elle sème le doute |
