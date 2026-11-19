# AIIDI — Media Collector

Collectez les images et les vidéos d'Instagram, choisissez les médias à conserver et téléchargez-les dans un dossier organisé par profil.

**Version validée : [v0.12.3](https://github.com/maissoumaboudrare/aiidi/tree/v0.12.3).**

AIIDI est une extension Chromium Manifest V3 pour ordinateur. Elle apparaît dans le navigateur sous le nom **Media Collector**. Son interface utilise des boutons en anglais, repris tels quels dans ce guide.


**Audio des vidéos** : la récupération de l'audio n'est pas prise en charge dans v0.12.3. Les vidéos téléchargées peuvent être dépourvues de son. AIIDI conserve le fichier vidéo fourni par Instagram sans récupérer ni assembler de piste audio séparée. Si le fichier source contient déjà du son, celui-ci est conservé.

## Fonctionnalités

- **Scan Post** : extraire les médias de la publication ouverte depuis un profil.
- **Scan Full Profile** : parcourir la grille d'un profil et analyser les publications découvertes, y compris les liens vers des reels présents dans cette grille.
- **Carrousels mixtes** : récupérer les images et les vidéos en conservant leur position dans la publication.
- **Vérification du profil** : écarter les publications dont l'auteur identifié ne correspond pas au profil analysé lors d'un scan complet.
- **Galerie de prévisualisation** : voir les miniatures, la position des médias et un badge pour les vidéos. Les vidéos sont représentées par une image d'aperçu.
- **Filtres et sélection** : afficher les images, les vidéos ou les deux, puis sélectionner les fichiers individuellement ou en groupe.
- **Suivi du scan complet** : consulter la progression, les nombres d'images et de vidéos, ainsi que les erreurs par publication.
- **Arrêt et reprise** : demander un arrêt après la publication en cours et reprendre un scan incomplet dans le même onglet.
- **Téléchargement manuel** : lancer uniquement le téléchargement des médias sélectionnés dans le filtre affiché.
- **Classement automatique** : ranger les fichiers dans `MediaCollector/nomduprofil/`, avec le code de la publication et la position du média dans leur nom.

## Installer l'extension

### Prérequis

- Un ordinateur avec une version récente de Google Chrome. L'extension cible les navigateurs Chromium ; la compatibilité avec chaque autre navigateur reste à vérifier.
- Une connexion Internet et une session Instagram ouverte dans ce navigateur.
- Un accès aux publications que vous souhaitez collecter.

L'installation décrite ici se fait depuis les fichiers du projet. Vous n'avez besoin ni de VS Code, ni de Node.js, ni de Git pour utiliser l'extension.

### Installation depuis la version validée

1. [Téléchargez le ZIP de v0.12.3](https://github.com/maissoumaboudrare/aiidi/archive/refs/tags/v0.12.3.zip).
2. Décompressez l'archive dans un dossier que vous conserverez sur votre ordinateur.
3. Dans Chrome, ouvrez `chrome://extensions`.
4. Activez **Mode développeur** en haut de la page.
5. Cliquez sur **Charger l'extension non empaquetée** (*Load unpacked*).
6. Sélectionnez le dossier décompressé qui contient directement `manifest.json`, et non le fichier ZIP.
7. Vérifiez que **Media Collector**, version **0.12.3**, apparaît et est activée.
8. Depuis le menu Extensions du navigateur, épinglez Media Collector pour retrouver son bouton facilement.
9. Ouvrez Instagram, connectez-vous si nécessaire, puis rechargez la page si elle était déjà ouverte avant l'installation.

Conservez le dossier de l'extension à son emplacement et laissez le mode développeur activé. Cette procédure suit le [guide officiel d'installation locale de Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Utiliser AIIDI

[Guide rapide illustré (PDF)](docs/aiidi-guide-rapide.pdf) pour télécharger les médias d'une publication ou d'un profil.

[English version (PDF)](docs/aiidi-quick-guide.pdf).

### Collecter une seule publication

1. Ouvrez le profil Instagram concerné.
2. Cliquez sur une publication dans sa grille pour l'ouvrir dans la fenêtre superposée à la page du profil.
3. Ouvrez Media Collector et cliquez sur **Scan Post**.
4. Gardez la publication et la fenêtre de l'extension ouvertes pendant l'analyse, puis attendez le résultat.
5. Vérifiez la galerie, ajustez la sélection, puis cliquez sur **Download Selected**.

Pour un carrousel, l'extension revient au début avant de parcourir les médias. Il n'est pas nécessaire de se placer manuellement sur sa première image.

Dans cette version, **Scan Post attend une publication ouverte dans la fenêtre superposée d'Instagram**. Si vous arrivez directement sur une URL de publication et qu'aucune fenêtre superposée n'est ouverte, revenez au profil et ouvrez la publication depuis sa grille.

### Collecter un profil

1. Ouvrez la page du profil, par exemple `https://www.instagram.com/nomduprofil/`, et placez-vous en haut de sa grille principale.
2. Fermez toute publication ouverte en superposition.
3. Ouvrez Media Collector et cliquez sur **Scan Full Profile**.
4. L'extension fait défiler le profil pour découvrir ses publications, puis les ouvre et les analyse une par une.
5. Attendez la fin du scan, consultez les éventuelles erreurs et choisissez les médias à télécharger.

Le scan complet continue si vous fermez la fenêtre de l'extension. Pour consulter sa progression, rouvrez Media Collector depuis le même onglet Instagram.

Pendant le scan, gardez cet onglet ouvert et évitez d'y naviguer, de faire défiler la page ou de changer de publication manuellement. Ne lancez qu'un scan de profil à la fois.

**Scan Full Profile ne déclenche aucun téléchargement automatique.** Les fichiers sont téléchargés uniquement après un clic sur **Download Selected**.

### Arrêter et reprendre un scan complet

Pendant l'extraction, **Stop after current post** demande un arrêt après la publication en cours. Une fois le scan arrêté, **Resume Full Profile** permet de reprendre les publications restantes.

Pour reprendre, revenez sur la page du même profil dans le même onglet, puis ouvrez l'extension. La progression et les sélections du scan complet sont enregistrées localement. Une reprise dans un nouvel onglet ou après la fermeture du navigateur n'est pas garantie.

L'arrêt n'est pas immédiat. Pendant la phase initiale de découverte, attendez le début de l'extraction pour demander l'arrêt.

### Filtrer et sélectionner

| Contrôle | Utilisation |
| --- | --- |
| **Both** | Afficher les images et les vidéos. |
| **Images** | Afficher uniquement les images. |
| **Videos** | Afficher uniquement les vidéos. |
| Clic sur une miniature | Sélectionner ou désélectionner le média. |
| **Select all** | Sélectionner ou désélectionner tous les médias du filtre actif. |
| **Download Selected** | Télécharger les médias sélectionnés du filtre actif. |

Les médias sont sélectionnés par défaut. Changer de filtre conserve leur sélection : avec **Videos** actif, les images restent sélectionnées mais ne seront pas téléchargées. Revenez sur **Both** pour télécharger l'ensemble de votre sélection.

## Retrouver les téléchargements

Les fichiers sont enregistrés dans le dossier de téléchargement configuré dans votre navigateur, sous cette arborescence :

```text
MediaCollector/
└── nomduprofil/
    ├── DXm0XJGCpt4_01.jpg
    ├── DXm0XJGCpt4_02.mp4
    └── DXm0XJGCpt4_06.jpg
```

Le préfixe correspond au code de la publication. Le numéro indique la position du média dans le carrousel, à partir de `01`. Si vous ne sélectionnez qu'une partie du carrousel, les numéros d'origine sont conservés.

Les vidéos portent l'extension `.mp4`. Les images utilisent l'extension détectée dans leur URL, parmi JPG, PNG et WebP, avec JPG par défaut. Les fichiers sont téléchargés depuis les URL collectées ; cette version n'applique pas de redimensionnement à 1080 pixels ni de conversion d'image.

Si un nom de fichier existe déjà, le navigateur crée un nom distinct plutôt que de remplacer le fichier existant.

Le message **Downloads queued** indique que les demandes ont été transmises au navigateur. Consultez son gestionnaire de téléchargements pour vérifier leur fin et les éventuels échecs. Gardez la fenêtre de l'extension ouverte jusqu'à la fin de la mise en file.

## Comprendre les résultats et résoudre un problème

Un scan à **100 %** indique que toutes les publications découvertes ont été traitées. Consultez aussi le compteur d'erreurs : ce pourcentage ne garantit pas que chaque média a pu être récupéré.

| Message ou situation | Que faire ? |
| --- | --- |
| **Open an Instagram profile first** | Ouvrez la page d'un profil avant de lancer le scan complet. |
| **No Instagram post is currently open** | Ouvrez une publication depuis la grille de son profil, puis relancez Scan Post. |
| **Reload Media Collector…** | Rechargez l'extension dans `chrome://extensions`, puis rechargez la page Instagram. |
| **No video identity received…** | Revenez au profil, rouvrez la publication et relancez le scan. |
| **Scan partially complete** ou erreurs par publication | Notez l'URL et le message, puis réessayez la publication avec Scan Post. |
| **Discovery may be incomplete** | Le chargement de toute la grille n'a pas pu être confirmé. Vérifiez la connexion et réessayez depuis le haut du profil. |
| **Interrupted** ou **Paused** | Revenez au même profil dans le même onglet et utilisez Resume Full Profile si proposé. |
| **Downloads queued**, mais un fichier manque | Vérifiez le gestionnaire de téléchargements du navigateur. Si le lien ne fonctionne plus, rescanez la publication pour obtenir un lien récent. |

Instagram peut modifier sa page ou la façon dont les médias sont chargés. La collecte dépend du contenu accessible et chargé dans votre session. Les stories, les directs et les autres sites ne font pas partie des fonctionnalités de v0.12.3.

## Données et autorisations

AIIDI utilise votre session Instagram déjà ouverte. L'extension ne vous demande pas votre mot de passe Instagram et n'envoie pas les médias à un serveur AIIDI.

L'analyse s'effectue dans le navigateur. L'extension lit les données des publications chargées par Instagram pour associer les vidéos à la bonne publication et au bon élément du carrousel. Les images et vidéos restent téléchargées depuis les serveurs qui les hébergent.

| Autorisation | Rôle dans l'extension |
| --- | --- |
| `activeTab` et `scripting` | Exécuter les outils d'analyse dans l'onglet Instagram utilisé. |
| Accès à `instagram.com` et `www.instagram.com` | Lire les données chargées par Instagram nécessaires à l'extraction. |
| `storage` | Conserver localement la progression, les résultats, les erreurs et les sélections du scan complet. |
| `downloads` | Enregistrer les médias sélectionnés via le gestionnaire de téléchargements du navigateur. |

## Mettre à jour l'extension

1. Terminez ou arrêtez le scan en cours.
2. Remplacez les fichiers de votre dossier d'installation par ceux de la version souhaitée.
3. Dans `chrome://extensions`, cliquez sur **Recharger** sur la carte Media Collector.
4. Rechargez les pages Instagram déjà ouvertes avant de lancer un nouveau scan.

Cette installation locale nécessite une mise à jour manuelle des fichiers.

## Participer aux tests

Pour signaler un problème ou proposer une amélioration, ouvrez une [issue sur GitHub](https://github.com/maissoumaboudrare/aiidi/issues).

Pour un bug, indiquez :

- la version de l'extension, votre navigateur et votre système ;
- le mode utilisé : Scan Post ou Scan Full Profile ;
- les étapes pour reproduire le problème ;
- le résultat attendu et celui obtenu ;
- le message d'erreur exact et l'URL concernée si elle peut être partagée publiquement.

Vous pouvez joindre une capture de la galerie ou de l'erreur. Ne publiez pas de mot de passe, de cookie de session ou de contenu privé dans une issue.

La version v0.12.3 a passé **26 tests automatisés**. Les scans et les téléchargements ont également été validés manuellement par le porteur du projet sur les publications et le profil utilisés pour les tests. Cela ne constitue pas une validation sur tous les profils ni tous les navigateurs Chromium.

## Pour les développeurs

Aucune compilation n'est nécessaire pour charger l'extension. Les principaux fichiers sont :

```text
manifest.json                   Configuration de l'extension
popup.html                      Interface
popup.js                        Galerie, sélection et téléchargements
adapters/instagram.js           Extraction d'une publication
adapters/instagram-network.js   Lecture des réponses chargées par Instagram
adapters/instagram-profile.js   Découverte des publications d'un profil
adapters/instagram-batch.js     Ouverture et fermeture des publications
adapters/profile-runner.js      Exécution et progression du scan complet
adapters/router.js              Choix de l'adaptateur selon le site
tests/                          Tests automatisés
```

Avec une version de Node.js prenant en charge `node:test`, lancez les tests depuis la racine du projet :

```bash
node --test tests/*.test.cjs
```

Le tag [`v0.12.3`](https://github.com/maissoumaboudrare/aiidi/tree/v0.12.3) identifie la version validée. La branche de travail est `feature/batch-media-extraction`.
