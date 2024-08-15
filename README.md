# Merlin-jailbreak
Un éditeur pour la fabrique à histoires Merlin (Bayard / Radio France) qui permet d'ajouter et de supprimer ses propres histoires, musiques ou sons.

## Pré-requis
Ouvrir la Merlin en dévissant les 4 vis dans le dos de l'enceinte, l'emplacement pour carte micro-SD est alors accessible.

## Utilisation
Les histoires sont toutes composées à la fois d'une image et d'un son.
Les fichiers images sont au format jpeg avec une résolution de 128x128, et les sons sont au format mp3 en stéréo à 128ko/s.
Vous pouvez déposer vos propres fichiers dans le même répertoire (en respectant le même nommage du couple miniature/son).

 - Pour afficher le contenu de la playlist:
```
python3 main.py playlist.bin
```

 - Pour mettre à jour la playlist après avoir supprimé ou ajouté des éléments:
```
python3 main.py playlist.bin -d
```
Cette commande ne modifie pas votre playlist. Elle demande une confirmation avant toute modification. Dans tous les cas, une sauvegarde est effectuée pour éviter tout problème.

Une fois la playlist mise à jour, les nouveaux sons apparaitront tous dans le dossier *Upload* de la Merlin.
