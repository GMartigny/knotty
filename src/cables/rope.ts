/**
 * Corde Verlet : une suite de points reliés par des contraintes de distance,
 * soumis à la gravité, dont les deux extrémités sont épinglées aux ports.
 */

export interface Vec {
    x: number;
    y: number;
}

export const ROPE = {
    /** Espacement visé entre deux points, en px. */
    spacing: 30,
    minPoints: 6,
    maxPoints: 24,
    /** Longueur de câble par rapport à la distance entre ports (> 1 = le câble pend). */
    slack: 1.12,
    /** Mou minimum en px, pour que les câbles courts pendent un peu aussi. */
    minSlack: 24,
    gravity: 1400,
    /** Amortissement de la vitesse à chaque pas (1 = aucun frottement). */
    damping: 0.94,
    iterations: 14,
    /** En dessous de ce déplacement par pas (px), la corde est considérée immobile. */
    sleepThreshold: 0.03,
};

const pointCountFor = (distance: number) =>
    Math.max(ROPE.minPoints, Math.min(ROPE.maxPoints, Math.round(distance / ROPE.spacing) + 1));

/** Rééchantillonne une polyligne en `count` points répartis selon la longueur d'arc. */
const resample = (points: Vec[], count: number): Vec[] => {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) {
        lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    const total = lengths[lengths.length - 1] || 1;
    const result: Vec[] = [];
    let seg = 0;
    for (let i = 0; i < count; i++) {
        const target = (total * i) / (count - 1);
        while (seg < points.length - 2 && lengths[seg + 1] < target) seg++;
        const span = lengths[seg + 1] - lengths[seg] || 1;
        const t = Math.min(1, Math.max(0, (target - lengths[seg]) / span));
        const a = points[seg];
        const b = points[seg + 1] ?? a;
        result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return result;
};

export class Rope {
    points: Vec[] = [];
    private prev: Vec[] = [];
    private a: Vec;
    private b: Vec;
    private awake = true;
    private calmFrames = 0;

    constructor(a: Vec, b: Vec) {
        this.a = { ...a };
        this.b = { ...b };
        const count = pointCountFor(Math.hypot(b.x - a.x, b.y - a.y));
        // Départ en ligne droite : la gravité fait tomber le câble dès les premières frames,
        // ce qui donne un petit rebond à chaque branchement.
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            this.points.push(p);
            this.prev.push({ ...p });
        }
    }

    get isAwake() {
        return this.awake;
    }

    /** Met à jour les extrémités ; réveille la corde si elles ont bougé. */
    setAnchors(a: Vec, b: Vec) {
        if (a.x === this.a.x && a.y === this.a.y && b.x === this.b.x && b.y === this.b.y) return;
        this.a = { ...a };
        this.b = { ...b };
        this.awake = true;
        this.calmFrames = 0;
        this.adaptResolution();
    }

    /** Ajuste le nombre de points à la longueur du câble. */
    private adaptResolution() {
        const wanted = pointCountFor(Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y));
        if (wanted === this.points.length) return;
        this.points = resample(this.points, wanted);
        this.prev = resample(this.prev, wanted);
    }

    step(dt: number) {
        if (!this.awake) return;
        const { points, prev } = this;
        const n = points.length;
        const g = ROPE.gravity * dt * dt;
        let motion = 0;

        // Intégration de Verlet sur les points libres.
        for (let i = 1; i < n - 1; i++) {
            const p = points[i];
            const vx = (p.x - prev[i].x) * ROPE.damping;
            const vy = (p.y - prev[i].y) * ROPE.damping;
            prev[i].x = p.x;
            prev[i].y = p.y;
            p.x += vx;
            p.y += vy + g;
        }

        // Contraintes de distance, extrémités épinglées.
        const distance = Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y);
        const length = Math.max(distance * ROPE.slack, distance + ROPE.minSlack);
        const segment = length / (n - 1);
        for (let k = 0; k < ROPE.iterations; k++) {
            points[0].x = this.a.x;
            points[0].y = this.a.y;
            points[n - 1].x = this.b.x;
            points[n - 1].y = this.b.y;
            for (let i = 0; i < n - 1; i++) {
                const p = points[i];
                const q = points[i + 1];
                const dx = q.x - p.x;
                const dy = q.y - p.y;
                const d = Math.hypot(dx, dy) || 0.0001;
                const diff = (d - segment) / d;
                const pFixed = i === 0;
                const qFixed = i + 1 === n - 1;
                if (pFixed && qFixed) continue;
                const wp = pFixed ? 0 : qFixed ? 1 : 0.5;
                const wq = qFixed ? 0 : pFixed ? 1 : 0.5;
                p.x += dx * diff * wp;
                p.y += dy * diff * wp;
                q.x -= dx * diff * wq;
                q.y -= dy * diff * wq;
            }
        }
        prev[0] = { ...points[0] };
        prev[n - 1] = { ...points[n - 1] };

        // Déplacement réel sur ce pas, après contraintes.
        for (let i = 1; i < n - 1; i++) {
            motion = Math.max(motion, Math.abs(points[i].x - prev[i].x) + Math.abs(points[i].y - prev[i].y));
        }
        this.calmFrames = motion < ROPE.sleepThreshold ? this.calmFrames + 1 : 0;
        if (this.calmFrames > 20) this.awake = false;
    }

    /** Chemin SVG lissé (Catmull-Rom → Bézier cubiques). */
    toPath(): string {
        const p = this.points;
        let d = `M ${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
        for (let i = 0; i < p.length - 1; i++) {
            const p0 = p[i - 1] ?? p[i];
            const p1 = p[i];
            const p2 = p[i + 1];
            const p3 = p[i + 2] ?? p2;
            const c1x = p1.x + (p2.x - p0.x) / 6;
            const c1y = p1.y + (p2.y - p0.y) / 6;
            const c2x = p2.x - (p3.x - p1.x) / 6;
            const c2y = p2.y - (p3.y - p1.y) / 6;
            d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        }
        return d;
    }
}
