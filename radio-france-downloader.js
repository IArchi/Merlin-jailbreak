/**
 * Radio France downloader
 * 
 * Allez sur une des pages de Radio France.
 * Par exemple https://www.radiofrance.fr/franceinter/podcasts/une-histoire-et-oli
 * Ouvrez la console développeur (F12) et collez le script Javascript ci dessous.
 * Toutes les histoires affichées à l'écran sont automatiquement téléchargées sur votre ordinateur.
 * Vous n'avez plus qu'à importer le dossier complet depuis l'interface de Merlin Jailbreak pour
 * toutes les importées dans la playlist.
 * 
 */
(async () => {

    /*************************
     * 1. Charger JSZip
     *************************/
    if (!window.JSZip) {
        await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    const zip = new JSZip();

    function sanitize(name) {
        return name
            .normalize("NFD")                // enlève accents complexes si besoin
            .replace(/[\u0300-\u036f]/g, "") // supprime diacritiques
            .replace(/[<>:"/\\|?*]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    async function fetchBlob(url) {
        const res = await fetch(url);
        return await res.blob();
    }

    /*************************
     * 2. Sélection épisodes
     *************************/
    const episodes = document.querySelectorAll('div[kind="web"][type="episode"]');

    console.log(`🎧 ${episodes.length} épisodes trouvés`);

    /*************************
     * 3. Traitement
     *************************/
    for (const [index, episode] of [...episodes].entries()) {

        const titleEl = episode.querySelector('.title a');
        if (!titleEl) continue;

        const title = sanitize(titleEl.textContent);

        console.log(`📦 (${index + 1}) ${title}`);

        /******** IMAGE ********/
        let imageUrl = null;

        const source = episode.querySelector('source[srcset*="560x315"]');

        if (source) {
            imageUrl = source.srcset
                .split(",")
                .find(x => x.includes("560x315"))
                ?.trim()
                .split(" ")[0];
        }

        /******** UUID ********/
        const playBtn = episode.querySelector('[id^="play-"]');

        if (!playBtn) {
            console.warn("❌ play introuvable:", title);
            continue;
        }

        const match = playBtn.id.match(/play-([0-9a-f-]{36})/);

        if (!match) {
            console.warn("❌ uuid introuvable:", title);
            continue;
        }

        const uuid = match[1];

        /******** API AUDIO ********/
        const json = await fetch(
            "https://www.radiofrance.fr/transistor/aod/" + uuid
        ).then(r => r.json());

        const audio = json.sources.find(s => s.url.endsWith(".mp3"))
                   || json.sources[0];

        /*************************
         * 4. Ajout ZIP
         *************************/

        const folder = zip.folder(title);

        // IMAGE
        if (imageUrl) {
            const imgBlob = await fetchBlob(imageUrl);
            folder.file("image.jpg", imgBlob);
        }

        // AUDIO
        const audioBlob = await fetchBlob(audio.url);
        const ext = audio.url.split(".").pop().split("?")[0];

        folder.file("audio." + ext, audioBlob);

        await new Promise(r => setTimeout(r, 300));
    }

    /*************************
     * 5. Génération ZIP
     *************************/
    console.log("📦 Génération du ZIP...");

    const content = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "episodes_radiofrance.zip";
    document.body.appendChild(a);
    a.click();

    URL.revokeObjectURL(a.href);

    console.log("✅ ZIP téléchargé !");
})();