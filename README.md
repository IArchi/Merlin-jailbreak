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

## Exemples

```
% python3 test.py playlist.bin 
Current playlist:
Root (id: 1, children: 6)
    |-- Histoires (id: 2, children: 7)
        |-- Petit Ours Brun (id: 3, children: 3)
            |-- Au lit ! (id: 4, files: df82635d-6598-4a30-906d-61c644520c5a)
            |-- Chez le docteur (id: 5, files: f9fe8e29-d79e-473a-b729-72875c4ccb0a)
            |-- Au manège (id: 6, files: 56b1725c-6fe7-4cbd-bb05-f405ecd8dd45)
        |-- SamSam (id: 7, children: 2)
            |-- Missions cosmiques (id: 8, files: d6c2d4a5-f722-4057-a6b3-03aab22b8986)
            |-- Une journée chez Crapouille (id: 9, files: b3651d53-7531-403d-9bf1-e89d99038b53)
        |-- Histoires pour les petits (id: 10, children: 15)
            |-- Je veux être berger ! (id: 11, files: ed0e434d-eb78-4553-ad40-bef826795edb)
            |-- L'école de la forêt (id: 12, files: 728ef604-3a6b-43f2-8201-41b1c66b594a)
            |-- La grosse faim de Petit renard (id: 13, files: 5f291af0-4e32-4980-a8b2-a272dfe10ba6)
            |-- La licorne et les enfants (id: 14, files: 1a813ed6-1408-4db2-8ad5-408d5d8c91bd)
            |-- La pêche d'Ysengrin (id: 15, files: 99626b17-b883-488a-9cf4-2b33b18c2863)
            |-- Le coq à la chocolaterie (id: 16, files: 7b3c31c9-3119-41bc-abe1-9fca439347b3)
            |-- Le doudou de Papa (id: 17, files: b36d441a-de43-4254-81a7-7289f4b9f977)
            |-- Le manchot qui voulait avoir chaud (id: 18, files: 31dc24b9-b8d1-4f99-b366-d24697864590)
            |-- Le vaillant petit tailleur (id: 19, files: 840bcbfb-a018-45cb-86c0-6777e93253b1)
            |-- Maya et le volcan Pipicaca (id: 20, files: 41293915-ebcc-495f-83ad-cb5d8a281359)
            |-- Merci pour les crêpes, Jasmin ! (id: 21, files: 2e370c7a-3074-4f13-a733-19e7229c2350)
            |-- Mon ami hippopotame (id: 22, files: fa363bc7-b6df-438f-8120-61470a2f6a08)
            |-- Mousse à l'école des pirates (id: 23, files: da5cd88c-2939-4442-b051-a960f73b4f20)
            |-- Le tout petit roi  (id: 24, files: 83fff060-2aa3-495b-8156-9cc9a03be273)
            |-- Le cakosaure de Nino Dino (id: 25, files: 10d42c5d-8476-47ab-b517-828dccf5c7e2)
        |-- Mes premières belles histoires (id: 26, children: 12)
            |-- Bonne nuit, Petit Ours ! (id: 27, files: 800c04ba-a5ae-4508-8b77-1295f36db63c)
            |-- Du lait pour mon chat (id: 28, files: af221ea0-eb00-4731-a2e1-1f8f1e77e18f)
            |-- Grand-mère Sucre et Grand-père Chocolat (id: 29, files: cbd6a2ed-a383-4cf4-93a0-70337e4f2e54)
            |-- La fée Fifolette a cassé sa baguette (id: 30, files: 55344392-3342-4d21-a51a-e37f2f641b98)
            |-- La fée Fifolette déclenche des tempêtes (id: 31, files: 3dbfe95b-ab94-4858-ad17-cd1cf6504c9b)
            |-- La fée Fifolette maîtresse d'école (id: 32, files: 3ebb5bcf-11d1-4ccd-abd7-a902023a9328)
            |-- Le petit pompier (id: 33, files: 14844dd2-9a10-4b71-bbd7-03b7d078ebfb)
            |-- Le petit roi Moi Moi Moi ! (id: 34, files: 0fba854a-d2f6-4323-a36f-a9b42fd60160)
            |-- Loup Gouloup et la lune (id: 35, files: 598ae78f-ac7f-4155-b7af-fc5b67ce7282)
            |-- Sara s'en va (id: 36, files: c6e71d54-d36e-43dd-b8c5-48bc17800672)
            |-- Un poussin de mauvais poil (id: 37, files: 13c83138-d070-49df-9903-59b0e1d47e59)
            |-- Une pomme pour deux (id: 38, files: 549bc01f-c9dd-4538-bc7a-3a41c12e0ba9)
        |-- Les belles histoires (id: 39, children: 2)
            |-- Le petit empereur de Chine (id: 40, files: ccc9a6a6-27c9-4609-9c73-394f09f1c03c)
            |-- Le dragon des pluies (id: 41, files: bef8a738-60b0-4dae-be95-9a92a6fbfe30)
        |-- J'apprends à lire (id: 42, children: 1)
            |-- La bonne pêche (id: 43, files: f4a4e530-a9e6-40e8-aab5-7bd8817bf81d)
        |-- Une histoire et...Oli (id: 44, children: 5)
            |-- Le petit galet gris qui rêvait de Tahiti (id: 45, files: bbdc2ff7-2737-4795-8594-e7e9be5a2f40)
            |-- Le petit pois et la princesse (id: 46, files: 1f2bb04e-de6b-4e0c-a2ea-cc260c5d5492)
            |-- L'arbre qui voulait voir le monde (id: 47, files: 80047531-45c2-48a2-9d2f-5f28cd332961)
            |-- Le chevalier à l'épée en chocolat (id: 48, files: a7553513-45cc-43fe-9191-f7c364078801)
            |-- Le Petit Pince (id: 49, files: ff4916cc-ea22-46a5-bca7-6e9e3a7b47f5)
    |-- Musique (id: 50, children: 6)
        |-- Comptines des animaux de la ferme (id: 51, children: 1)
            |-- Rencontre blues (id: 52, files: 69f6f40b-716f-4b7c-905a-85ebcd734cd7)
        |-- Hello Pomme d'Api (id: 53, children: 7)
            |-- Jelly on a plate (id: 54, files: a2f7094d-764d-41d5-bded-6296a7bce806)
            |-- I like to eat apples and bananas (id: 55, files: 7a4aeba3-d890-4539-a918-16b6aef891d1)
            |-- 1,2,3,4,5, I caught a fish alive (id: 56, files: 555c8262-b75c-4711-97a7-988046f7d1d2)
            |-- The numbers dance song (id: 57, files: 833c8a5d-d15e-487b-aa4c-7ffbb5216c58)
            |-- The colour song (id: 58, files: 47775591-1e5a-471d-9364-e7a209231bd8)
            |-- The finger family (id: 59, files: 4cc64ab8-6ab2-4f55-a57e-65f5f963b5d7)
            |-- Rain, rain, go away (id: 60, files: 76e9e29b-9318-440c-9c9a-90bb2762de32)
        |-- Concerts-fictions de Radio France (id: 61, children: 4)
            |-- L'histoire de Babar (id: 62, files: dfb0cd1a-e404-4bda-8e90-094541cbdf4c)
            |-- Pierre et le Loup (id: 63, files: b7f46e07-cca6-4416-b97c-fbabb6741b8d)
            |-- Le retour du Loup (id: 64, files: 8c5a3270-6079-4e86-87a6-3825e1e50533)
            |-- Le Carnaval des Animaux (id: 65, files: ca6d4c1e-8da0-469f-85a5-27b5fda31de8)
        |-- Les comptines de la Maîtrise (id: 66, children: 8)
            |-- Une Fourmi de dix-huit mètres (id: 67, files: 84103235-29d2-4d9c-abf9-0abfcbb91eb8)
            |-- Trois escargots (id: 68, files: 1a2f9bbe-2535-473c-94c1-f27ab8278bd5)
            |-- Les petites souris (id: 69, files: afb43f7b-d41e-408d-a299-151a20001fff)
            |-- La Grenouille aux Souliers Percés (id: 70, files: ddc46417-41d4-4ccb-a9da-810f174ef992)
            |-- L'Araignée à Moustaches (id: 71, files: 26ae1969-2d08-4b58-8977-16373a88cebf)
            |-- La ronde des oiseaux (id: 72, files: b706333a-6de1-4833-8bd9-c88740991235)
            |-- Le Ver Luisant (id: 73, files: 0ef73540-5f55-4985-91a9-0d3c11d22050)
            |-- Les souris dansent (id: 74, files: 199e97a0-f46e-4b40-84a5-ac54945e8903)
        |-- Les contes musicaux (id: 75, children: 2)
            |-- Anaïg et les merveilleux nuages (id: 76, files: df5fbdf2-8d5a-4ff2-b0fc-4cb5c11bc778)
            |-- Nanette la fille aux cheveux de lin (id: 77, files: 8e5becee-ea5d-49d8-86ab-3ca8b899c045)
        |-- Octave et Mélo (id: 78, children: 4)
            |-- La source (id: 79, files: 29978fa3-dfa4-4774-88dc-72a40b89f165)
            |-- Le radeau (id: 80, files: b293db16-eeb5-4d8a-a2b7-47a360418bb5)
            |-- Le camping sauvage (id: 81, files: 17c4a6f1-46a8-4165-a7ab-61359a967a44)
            |-- La mer (id: 82, files: fb1c7bd1-7635-4a10-9f95-4d2131a91254)
    |-- Documentaires (id: 83, children: 3)
        |-- Mes p'tits docs (id: 84, children: 5)
            |-- Les chevaliers (id: 85, files: 6cb0bfa5-0275-41e8-a00d-0e80af530dae)
            |-- Les pompiers (id: 86, files: 76a29c1c-da10-4708-bfba-b3196c04628b)
            |-- La musique (id: 87, files: b8257da2-6b07-46ba-b3b9-bb454c3d94b0)
            |-- Les crottes (id: 88, files: bf1cd480-d525-45ab-818b-dc1f14af185c)
            |-- Les loups (id: 89, files: ac9303ed-9140-427f-bcc9-fb464f6b58ed)
        |-- Bestioles (id: 90, children: 2)
            |-- La girafe, une histoire à dormir debout (id: 91, files: 0c0eeee3-0233-455e-89fb-e8f45d06bdea)
            |-- Le crocodile : petit croco se jette à l'eau (id: 92, files: 87cd2585-1dca-4fc4-bf1c-65430b7ffc4a)
        |-- Les animaux du monde (id: 93, children: 6)
            |-- Le caméléon (id: 94, files: 339731af-4592-446f-8618-7a609fdc159b)
            |-- Le dauphin (id: 95, files: 833d82e3-ca06-4fd8-9f50-c56cd96812e6)
            |-- Le hérisson (id: 96, files: 497d4a1d-b62e-4cc3-9411-fda5de752fd7)
            |-- Le panda (id: 97, files: b19bb57d-da4f-460e-80c1-ae63ac5a7c0b)
            |-- Le phoque (id: 98, files: db16d3c7-c30c-471f-bd7a-7f1c10f2d53b)
            |-- L'éléphant (id: 99, files: d5238536-f3b9-441b-aed5-f6038fb33c58)
    |-- Calme (id: 100, children: 6)
        |-- Le hérisson (id: 101, files: b3865237-5906-472d-a0af-ef3c6f08d257)
        |-- Le papillon (id: 102, files: f3fcee91-0982-4b81-860e-e7020d46935a)
        |-- Le flamant rose (id: 103, files: 0c852fda-fc4f-4849-98eb-43fb21566fa5)
        |-- Le sapin (id: 104, files: 242905f9-f285-4edd-875b-915a14349e9a)
        |-- Le cobra (id: 105, files: ae490f67-b621-4106-8054-344c2fc2f19a)
        |-- La balade du silence (id: 106, files: 5d21c4bc-54bc-4e16-95e9-a622aa7ef6f5)
    |-- Merlin_favorite (id: 107, children: 8)
    |-- Merlin_discover (id: 108, children: 15)
        |-- Le Petit Pince (id: 109, files: ff4916cc-ea22-46a5-bca7-6e9e3a7b47f5)
        |-- Le chevalier à l'épée en chocolat (id: 110, files: a7553513-45cc-43fe-9191-f7c364078801)
        |-- Le petit pois et la princesse (id: 111, files: 1f2bb04e-de6b-4e0c-a2ea-cc260c5d5492)
        |-- L'arbre qui voulait voir le monde (id: 112, files: 80047531-45c2-48a2-9d2f-5f28cd332961)
        |-- Le petit galet gris qui rêvait de Tahiti (id: 113, files: bbdc2ff7-2737-4795-8594-e7e9be5a2f40)
        |-- La balade du silence (id: 114, files: 5d21c4bc-54bc-4e16-95e9-a622aa7ef6f5)
        |-- La mer (id: 115, files: fb1c7bd1-7635-4a10-9f95-4d2131a91254)
        |-- Le camping sauvage (id: 116, files: 17c4a6f1-46a8-4165-a7ab-61359a967a44)
        |-- Le radeau (id: 117, files: b293db16-eeb5-4d8a-a2b7-47a360418bb5)
        |-- La source (id: 118, files: 29978fa3-dfa4-4774-88dc-72a40b89f165)
        |-- Nanette la fille aux cheveux de lin (id: 119, files: 8e5becee-ea5d-49d8-86ab-3ca8b899c045)
        |-- Anaïg et les merveilleux nuages (id: 120, files: df5fbdf2-8d5a-4ff2-b0fc-4cb5c11bc778)
        |-- Rencontre blues (id: 121, files: 69f6f40b-716f-4b7c-905a-85ebcd734cd7)
        |-- La girafe, une histoire à dormir debout (id: 122, files: 0c0eeee3-0233-455e-89fb-e8f45d06bdea)
        |-- Le crocodile : petit croco se jette à l'eau (id: 123, files: 87cd2585-1dca-4fc4-bf1c-65430b7ffc4a)
```

J'ai ajouté un nouveau son et supprimé deux fichiers mp3 qui ne m'intéressaient pas:
```
python3 test.py playlist.bin -d
>  1 new sounds found
 - [A] ma musique
>  99 sounds have been removed
 - [D] Au lit !
 - [D] Chez le docteur

Hit enter to simulate the new playlist (Y/n): 
Enter title for sound ma musique: Mon titre de musique

Root (id: 1, children: 7)
    ......
    |-- Upload (id: 124, children: 1)
        |-- Mon titre de musique (id: 125, files: 60459d15-d8ce-4b6a-b226-a4a1f0efc8b9)
```
