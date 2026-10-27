/* ============================================================
   GLOBE RÉSEAU 3D — piloté par le défilement
   Un réseau de nœuds en sphère tourne pendant le défilement ;
   un anneau de scan le balaie et sécurise les nœuds (cyan).
   ============================================================ */
(() => {
    const pin = document.querySelector(".hero-pin");
    const canvas = document.querySelector(".globe");
    if (!pin || !canvas) return;

    const ctx = canvas.getContext("2d");
    const navbar = document.querySelector(".navbar");
    const hudValeur = document.querySelector(".hud-valeur");
    const hint = document.querySelector(".defiler");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const CYAN = "0, 204, 255";
    const BLANC = "255, 255, 255";
    const NB_VOISINS = 3;
    const NB_PAQUETS = 26;

    let W = 0, H = 0, R = 0, cx = 0, cy = 0;
    let points = [];
    let aretes = [];
    let voisins = [];
    let paquets = [];
    let anneaux = [];
    let visible = true;
    let dernierTemps = 0;

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const lissage = t => t * t * (3 - 2 * t);

    /* ── Construction du réseau ─────────────────────────── */
    function construire(n) {
        // Points répartis uniformément (spirale de Fibonacci)
        points = [];
        const angleOr = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < n; i++) {
            const y = 1 - (i / (n - 1)) * 2;
            const r = Math.sqrt(1 - y * y);
            const theta = angleOr * i;
            points.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
        }

        // Chaque nœud est relié à ses plus proches voisins
        const vues = new Set();
        aretes = [];
        voisins = points.map(() => []);
        points.forEach((a, i) => {
            points
                .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 }))
                .filter(o => o.j !== i)
                .sort((o1, o2) => o1.d - o2.d)
                .slice(0, NB_VOISINS)
                .forEach(({ j }) => {
                    const cle = i < j ? `${i}-${j}` : `${j}-${i}`;
                    if (vues.has(cle)) return;
                    vues.add(cle);
                    aretes.push([i, j]);
                    voisins[i].push(j);
                    voisins[j].push(i);
                });
        });

        // Paquets de données qui circulent de nœud en nœud
        paquets = Array.from({ length: NB_PAQUETS }, () => {
            const [a, b] = aretes[Math.floor(Math.random() * aretes.length)];
            return { a, b, t: Math.random(), vitesse: 0.5 + Math.random() * 0.8 };
        });

        // Deux orbites inclinées avec un satellite chacune
        anneaux = [
            { rayon: 1.3, inclinaison: 1.15, vitesse: 0.35, phase: 0 },
            { rayon: 1.5, inclinaison: -0.7, vitesse: -0.22, phase: 2 }
        ];
    }

    function redimensionner() {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = rect.width;
        H = rect.height;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        R = Math.min(W, H) * 0.34;
        cx = W / 2;
        cy = H / 2;
        const n = W < 520 ? 170 : 280;
        if (points.length !== n) construire(n);
    }

    /* ── Progression du défilement (0 → 1) ──────────────── */
    function progression() {
        const r = pin.getBoundingClientRect();
        const nav = navbar ? navbar.offsetHeight : 0;
        const course = r.height - window.innerHeight + nav;
        return course > 0 ? clamp((nav - r.top) / course, 0, 1) : 0;
    }

    /* ── Rendu ──────────────────────────────────────────── */
    function dessiner(temps) {
        const dt = Math.min((temps - dernierTemps) / 1000, 0.05);
        dernierTemps = temps;

        const p = progression();
        const rotY = (reduceMotion ? 0 : temps * 0.00006) + p * Math.PI * 1.6;
        const incl = 0.38 - p * 0.28;
        const echelle = R * (1 + lissage(p) * 0.16);
        const balayage = p * 1.2 - 0.1;

        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosT = Math.cos(incl), sinT = Math.sin(incl);

        const projeter = (x, y, z) => {
            const x1 = x * cosY + z * sinY;
            const z1 = -x * sinY + z * cosY;
            const y1 = y * cosT - z1 * sinT;
            const z2 = y * sinT + z1 * cosT;
            const k = 3 / (3 + z2);
            return { x: cx + x1 * echelle * k, y: cy + y1 * echelle * k, d: (1 - z2) / 2 };
        };

        const proj = points.map(pt => projeter(pt.x, pt.y, pt.z));
        const securise = points.map(pt => (1 - pt.y) / 2 < balayage);

        ctx.clearRect(0, 0, W, H);

        // Halo central, de plus en plus cyan à mesure que le réseau est sécurisé
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, echelle * 1.5);
        halo.addColorStop(0, `rgba(${CYAN}, ${0.03 + 0.07 * p})`);
        halo.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, W, H);

        // Orbites
        anneaux.forEach(o => {
            const ci = Math.cos(o.inclinaison), si = Math.sin(o.inclinaison);
            const pointOrbite = a => {
                const x = Math.cos(a) * o.rayon, z = Math.sin(a) * o.rayon;
                return projeter(x, -z * si, z * ci);
            };
            ctx.lineWidth = 1;
            let prec = pointOrbite(0);
            for (let s = 1; s <= 96; s++) {
                const cur = pointOrbite((s / 96) * Math.PI * 2);
                ctx.strokeStyle = `rgba(${BLANC}, ${0.03 + 0.1 * cur.d})`;
                ctx.beginPath();
                ctx.moveTo(prec.x, prec.y);
                ctx.lineTo(cur.x, cur.y);
                ctx.stroke();
                prec = cur;
            }
            const sat = pointOrbite(o.phase + temps * 0.001 * o.vitesse * (reduceMotion ? 0 : 1) + p * 3);
            ctx.fillStyle = `rgba(${CYAN}, ${0.3 + 0.7 * sat.d})`;
            ctx.beginPath();
            ctx.arc(sat.x, sat.y, 1.5 + 1.5 * sat.d, 0, Math.PI * 2);
            ctx.fill();
        });

        // Liaisons
        ctx.lineWidth = 1;
        aretes.forEach(([i, j]) => {
            const a = proj[i], b = proj[j];
            const d = (a.d + b.d) / 2;
            const ok = securise[i] && securise[j];
            const alpha = (0.04 + 0.32 * d * d) * (ok ? 1.25 : 0.8);
            ctx.strokeStyle = `rgba(${ok ? CYAN : BLANC}, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        });

        // Anneau de scan à la latitude du balayage
        if (balayage > 0 && balayage < 1) {
            const ys = 1 - 2 * balayage;
            const rs = Math.sqrt(1 - ys * ys) * 1.02;
            ctx.lineWidth = 1.5;
            let prec = projeter(rs, ys, 0);
            for (let s = 1; s <= 120; s++) {
                const a = (s / 120) * Math.PI * 2;
                const cur = projeter(Math.cos(a) * rs, ys, Math.sin(a) * rs);
                ctx.strokeStyle = `rgba(${CYAN}, ${0.15 + 0.75 * cur.d * cur.d})`;
                ctx.beginPath();
                ctx.moveTo(prec.x, prec.y);
                ctx.lineTo(cur.x, cur.y);
                ctx.stroke();
                prec = cur;
            }
        }

        // Nœuds
        proj.forEach((pt, i) => {
            const ok = securise[i];
            const couleur = ok ? CYAN : BLANC;
            const rayon = 0.8 + 1.6 * pt.d;
            if (ok && pt.d > 0.6) {
                ctx.fillStyle = `rgba(${CYAN}, ${0.12 * pt.d})`;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, rayon * 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = `rgba(${couleur}, ${0.2 + 0.8 * pt.d})`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, rayon, 0, Math.PI * 2);
            ctx.fill();
        });

        // Paquets de données
        if (!reduceMotion) {
            paquets.forEach(pq => {
                pq.t += dt * pq.vitesse;
                if (pq.t >= 1) {
                    const suivants = voisins[pq.b].filter(v => v !== pq.a);
                    pq.a = pq.b;
                    pq.b = suivants.length ? suivants[Math.floor(Math.random() * suivants.length)] : voisins[pq.b][0];
                    pq.t = 0;
                }
                const a = proj[pq.a], b = proj[pq.b];
                const t0 = Math.max(0, pq.t - 0.35);
                const x = a.x + (b.x - a.x) * pq.t, y = a.y + (b.y - a.y) * pq.t;
                const xq = a.x + (b.x - a.x) * t0, yq = a.y + (b.y - a.y) * t0;
                const d = a.d + (b.d - a.d) * pq.t;
                const couleur = securise[pq.a] && securise[pq.b] ? CYAN : BLANC;
                ctx.strokeStyle = `rgba(${couleur}, ${0.5 * d})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(xq, yq);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.fillStyle = `rgba(${couleur}, ${0.35 + 0.65 * d})`;
                ctx.beginPath();
                ctx.arc(x, y, 1.6, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Indicateurs
        if (hudValeur) hudValeur.textContent = `${Math.round(clamp(balayage, 0, 1) * 100)} %`;
        if (hint) hint.style.opacity = clamp(1 - p * 8, 0, 1);
    }

    /* ── Boucle d'animation (uniquement si visible) ─────── */
    let enCours = false;

    function boucle(temps) {
        if (!visible || document.hidden) {
            enCours = false;
            return;
        }
        dessiner(temps);
        requestAnimationFrame(boucle);
    }

    function demarrer() {
        if (reduceMotion) {
            requestAnimationFrame(dessiner);
            return;
        }
        if (enCours) return;
        enCours = true;
        requestAnimationFrame(t => {
            dernierTemps = t;
            boucle(t);
        });
    }

    new IntersectionObserver(entrees => {
        visible = entrees[0].isIntersecting;
        if (visible) demarrer();
    }).observe(pin);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) demarrer();
    });

    window.addEventListener("resize", () => {
        redimensionner();
        demarrer();
    });

    if (reduceMotion) {
        window.addEventListener("scroll", demarrer, { passive: true });
    }

    redimensionner();
    demarrer();

    /* ── Nom « déchiffré » au chargement ────────────────── */
    const titre = document.querySelector("[data-dechiffre]");
    if (titre && !reduceMotion) {
        const texte = titre.textContent;
        const signes = "01ABCDEF#$%&<>/*";
        const debut = performance.now();
        titre.setAttribute("aria-label", texte);

        const etape = maintenant => {
            const ecoule = maintenant - debut;
            let fini = true;
            titre.textContent = [...texte].map((c, i) => {
                if (c === " " || ecoule > 300 + i * 75) return c;
                fini = false;
                return signes[Math.floor(Math.random() * signes.length)];
            }).join("");
            if (!fini) requestAnimationFrame(etape);
        };
        requestAnimationFrame(etape);
    }
})();
