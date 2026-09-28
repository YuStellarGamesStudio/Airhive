import {VISUALS as V} from '../data/visuals.js';
import {ASSET_URLS} from '../data/assets.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha: false});
    if (!this.ctx) throw new Error('Canvas 2D is unavailable');
    this.images = new Map();
    this.loading = null;
    this.cloud = null;
    this.particles = Array.from({length: V.maxParticles}, () => ({life: 0}));
    this.nextParticle = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.flash = 0;
    this.ring = 0;
    this.ringX = V.width / 2;
    this.ringY = V.height / 2;
    this.paused = false;
    this.reducedMotion = false;
    this.lastPlayerX = null;
    this.bank = 0;
  }

  load() {
    if (this.loading) return this.loading;
    this.loading = Promise.all(V.spriteIds.map(async (id) => {
      const source = new Image();
      await new Promise((resolve, reject) => {
        source.onload = resolve;
        source.onerror = () => reject(new Error(`Unable to load art: ${id}`));
        source.src = new URL(`../../${ASSET_URLS[`assets/art/${id}.svg`]}`, import.meta.url).href;
      });
      const [w, h] = id === 'background' ? V.dimensions.background
        : id === 'player' ? V.dimensions.player
        : id === 'obstacle' ? V.dimensions.obstacle
        : id[0] === 'B' ? V.dimensions.boss : V.dimensions.enemy;
      const scale = id === 'background' ? V.skyScale : V.spriteScale;
      const surface = document.createElement('canvas');
      surface.width = w * scale;
      surface.height = h * scale;
      surface.getContext('2d').drawImage(source, 0, 0, surface.width, surface.height);
      this.images.set(id, surface);
    })).then(() => { this.makeCloud(); }).catch((error) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  makeCloud() {
    const cloud = document.createElement('canvas');
    cloud.width = 360;
    cloud.height = 112;
    const ctx = cloud.getContext('2d');
    const fog = ctx.createRadialGradient(180, 64, 8, 180, 64, 168);
    fog.addColorStop(0, 'rgba(222,235,237,.48)');
    fog.addColorStop(0.46, 'rgba(162,196,209,.23)');
    fog.addColorStop(1, 'rgba(122,167,187,0)');
    ctx.fillStyle = fog;
    for (const [x, y, rx, ry] of [[83, 68, 79, 27], [145, 49, 81, 34], [205, 56, 94, 40], [277, 68, 80, 27]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
    }
    this.cloud = cloud;
  }

  spawn(x, y, count, kind = 'flame') {
    if (this.reducedMotion) count = Math.max(2, Math.ceil(count / 3));
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.nextParticle];
      this.nextParticle = (this.nextParticle + 1) % this.particles.length;
      const angle = Math.random() * TAU;
      const velocity = (kind === 'debris' ? 55 : 35) + Math.random() * (kind === 'smoke' ? 48 : 150);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * velocity;
      p.vy = Math.sin(angle) * velocity - (kind === 'smoke' ? 27 : 0);
      p.kind = kind;
      p.size = 1.5 + Math.random() * (kind === 'smoke' ? 15 : 5);
      p.maxLife = kind === 'smoke' ? V.smokeLife : kind === 'debris' ? V.debrisLife : kind === 'flame' ? V.flameLife : V.particleLife;
      p.life = p.maxLife * (0.55 + Math.random() * 0.45);
      p.rotation = Math.random() * TAU;
    }
  }

  event({type, x = V.width / 2, y = V.height / 2, boss = false} = {}) {
    if (this.paused) return;
    if (type === 'explosion' || type === 'bomb') {
      const count = boss ? V.bossExplosionParticles : V.explosionParticles;
      this.spawn(x, y, count, 'flame');
      this.spawn(x, y, Math.ceil(count / 3), 'smoke');
      this.spawn(x, y, Math.ceil(count / 3), 'debris');
      this.shake = Math.max(this.shake, boss ? V.shakeBoss : V.shakeExplosion);
      this.flash = Math.max(this.flash, boss ? 0.8 : 0.27);
      if (boss) { this.ring = 1; this.ringX = x; this.ringY = y; }
    } else if (type === 'hit' || type === 'shield') {
      this.spawn(x, y, V.hitParticles, type === 'shield' ? 'spark' : 'flame');
      this.shake = Math.max(this.shake, V.shakeHit);
      this.flash = Math.max(this.flash, 0.13);
    } else if (type === 'pickup' || type === 'life' || type === 'upgrade') {
      this.spawn(x, y, V.pickupParticles, 'spark');
    } else if (type === 'gameover') {
      this.spawn(x, y, V.bossExplosionParticles, 'smoke');
      this.shake = V.shakeBoss;
    }
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round((this.canvas.clientWidth || V.width) * dpr));
    const height = Math.max(1, Math.round((this.canvas.clientHeight || V.height) * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.setTransform(width / V.width, 0, 0, height / V.height, 0, 0);
  }

  drawSky(ctx) {
    const sky = this.images.get('background');
    if (sky) ctx.drawImage(sky, 0, 0, V.width, V.height);
    else { ctx.fillStyle = '#101e33'; ctx.fillRect(0, 0, V.width, V.height); }
    if (!this.cloud) return;
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const near = i > 2;
      const speed = near ? V.cloudSpeedNear : V.cloudSpeedFar;
      const cycle = V.width + 380;
      const x = ((i * 271 - this.elapsed * speed) % cycle + cycle) % cycle - 350;
      const y = near ? 215 + (i % 3) * 67 : 62 + i * 68;
      ctx.globalAlpha = near ? V.cloudOpacityNear : V.cloudOpacityFar;
      ctx.drawImage(this.cloud, x, y, near ? 370 : 275, near ? 115 : 76);
    }
    ctx.restore();
  }

  sprite(ctx, id, entity, bank = 0) {
    const img = this.images.get(id);
    if (!img || !entity || entity.active === false) return;
    if (!bank) {
      ctx.drawImage(img, entity.x - entity.w / 2, entity.y - entity.h / 2, entity.w, entity.h);
      return;
    }
    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.rotate(clamp(bank, -1, 1) * V.bankAngle);
    ctx.drawImage(img, -entity.w / 2, -entity.h / 2, entity.w, entity.h);
    ctx.restore();
  }

  drawPlayer(ctx, player, active) {
    if (!player || !active) return;
    const blink = player.invulnerable > 0 && Math.sin(this.elapsed * 29) > 0.4;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.52;
    const pulse = 0.8 + Math.sin(this.elapsed * TAU * V.flamePulseHz) * 0.18;
    const nozzleY = player.y + player.h * 0.42;
    const flame = ctx.createLinearGradient(0, nozzleY, 0, nozzleY + 33);
    flame.addColorStop(0, 'rgba(255,249,212,.98)');
    flame.addColorStop(0.34, 'rgba(107,211,240,.88)');
    flame.addColorStop(1, 'rgba(250,129,71,0)');
    ctx.fillStyle = flame;
    for (const offset of [-player.w * 0.095, player.w * 0.095]) {
      ctx.beginPath();
      ctx.moveTo(player.x + offset - 4, nozzleY);
      ctx.quadraticCurveTo(player.x + offset, nozzleY + pulse * 38, player.x + offset + 3, nozzleY + pulse * 31);
      ctx.lineTo(player.x + offset + 4, nozzleY);
      ctx.fill();
    }
    this.sprite(ctx, 'player', player, this.bank);
    if (player.shield) {
      ctx.strokeStyle = 'rgba(110,228,246,.75)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#8de9ff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.ellipse(player.x, player.y, player.w * 0.68, player.h * 0.63, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawShots(ctx, shots, enemy = false) {
    if (!shots) return;
    for (const shot of shots) {
      if (!shot || shot.active === false) continue;
      if (enemy && shot.kind === 'laser' && shot.delay > 0) {
        ctx.save();
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = 'rgba(255,95,90,.63)';
        ctx.lineWidth = 2;
        ctx.beginPath();ctx.moveTo(shot.x, shot.y);ctx.lineTo(shot.x, V.height);ctx.stroke();
        ctx.restore();
        continue;
      }
      if (enemy && (shot.kind === 'mine' || shot.kind === 'bomb')) {
        const radius = Math.max(5, Math.min(shot.w / 2, 16));
        ctx.fillStyle = shot.kind === 'mine' ? '#963f48' : '#ad6650';
        ctx.strokeStyle = '#f5bc8e';
        ctx.lineWidth = 2;
        ctx.beginPath();ctx.arc(shot.x, shot.y, radius, 0, TAU);ctx.fill();ctx.stroke();
        ctx.fillStyle = '#ffe5a4';
        ctx.beginPath();ctx.arc(shot.x - radius / 4, shot.y - radius / 4, radius / 4, 0, TAU);ctx.fill();
        if (shot.kind === 'mine') {
          ctx.strokeStyle = '#dca59a';
          for (let i = 0; i < 8; i++) {
            const angle = i * TAU / 8;
            ctx.beginPath();
            ctx.moveTo(shot.x + Math.cos(angle) * radius, shot.y + Math.sin(angle) * radius);
            ctx.lineTo(shot.x + Math.cos(angle) * (radius + 5), shot.y + Math.sin(angle) * (radius + 5));
            ctx.stroke();
          }
        }
        continue;
      }
      const direction = enemy ? 1 : -1;
      const vx = shot.vx || 0, vy = shot.vy ?? direction;
      const speed = Math.hypot(vx, vy) || 1;
      const length = enemy ? V.enemyTrail : V.bulletTrail;
      const endX = shot.x - vx / speed * length;
      const endY = shot.y - vy / speed * length;
      ctx.strokeStyle = enemy ? 'rgba(255,90,81,.32)' : 'rgba(104,208,252,.34)';
      ctx.lineWidth = enemy ? 9 : 8;
      ctx.beginPath(); ctx.moveTo(endX, endY); ctx.lineTo(shot.x, shot.y); ctx.stroke();
      ctx.strokeStyle = enemy ? shot.kind === 'laser' ? '#ffd9a1' : '#ffab75' : '#91edff';
      ctx.lineWidth = enemy ? 3.1 : 2.8;
      ctx.beginPath(); ctx.moveTo(endX, endY); ctx.lineTo(shot.x, shot.y); ctx.stroke();
      ctx.fillStyle = '#fffce3';
      ctx.beginPath(); ctx.arc(shot.x, shot.y, enemy ? 3.2 : 3, 0, TAU); ctx.fill();
    }
  }

  drawPickup(ctx, item) {
    if (!item || item.active === false) return;
    const color = V.pickupColors[item.type] || '#eac590';
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(this.elapsed * 0.45);
    ctx.shadowBlur = 13;
    ctx.shadowColor = color;
    ctx.fillStyle = '#152e42';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = TAU * i / 6 - Math.PI / 2;
      if (i) ctx.lineTo(Math.cos(a) * item.w * 0.5, Math.sin(a) * item.h * 0.5);
      else ctx.moveTo(Math.cos(a) * item.w * 0.5, Math.sin(a) * item.h * 0.5);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(-this.elapsed * 0.45);
    ctx.strokeStyle = '#f8f5df';
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    switch (item.type) {
      case 'power': ctx.moveTo(2,-10);ctx.lineTo(-5,1);ctx.lineTo(1,1);ctx.lineTo(-2,10);ctx.lineTo(7,-3);ctx.lineTo(1,-3);ctx.closePath();ctx.fill();break;
      case 'homing': ctx.arc(0,0,7,0,TAU);ctx.moveTo(-11,0);ctx.lineTo(-5,0);ctx.moveTo(5,0);ctx.lineTo(11,0);ctx.moveTo(0,-11);ctx.lineTo(0,-5);ctx.moveTo(0,5);ctx.lineTo(0,11);ctx.stroke();break;
      case 'shield': ctx.moveTo(0,-9);ctx.lineTo(8,-5);ctx.lineTo(6,5);ctx.lineTo(0,10);ctx.lineTo(-6,5);ctx.lineTo(-8,-5);ctx.closePath();ctx.stroke();break;
      case 'bomb': ctx.arc(0,2,7,0,TAU);ctx.moveTo(3,-7);ctx.lineTo(8,-11);ctx.stroke();break;
      case 'life': case 'heal': ctx.moveTo(-9,-3);ctx.bezierCurveTo(-9,-11,0,-11,0,-5);ctx.bezierCurveTo(0,-11,9,-11,9,-3);ctx.bezierCurveTo(9,3,0,10,0,10);ctx.bezierCurveTo(0,10,-9,3,-9,-3);ctx.fill();break;
      default: ctx.arc(0,0,5,0,TAU);ctx.fill();
    }
    ctx.restore();
  }

  drawParticles(ctx, dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life = Math.max(0, p.life - dt);
      if (!p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += dt * 2;
      if (p.kind !== 'smoke') p.vy += 75 * dt;
      const progress = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, progress * 1.4);
      if (p.kind === 'smoke') {
        ctx.fillStyle = '#8296a2';
        ctx.beginPath();ctx.arc(p.x,p.y,p.size * (1.7 - progress),0,TAU);ctx.fill();
      } else if (p.kind === 'debris') {
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation);
        ctx.fillStyle = '#b5c7c5';ctx.fillRect(-p.size,-1.3,p.size*2,2.6);ctx.restore();
      } else {
        ctx.fillStyle = p.kind === 'spark' ? '#9debf1' : progress > 0.55 ? '#fff0b3' : '#ed8053';
        ctx.beginPath();ctx.arc(p.x,p.y,p.size * progress,0,TAU);ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawBoss(ctx, boss, t) {
    if (!boss || boss.active === false) return;
    const ratio = clamp((boss.hp || 0) / (boss.maxHp || 1), 0, 1);
    const phaseNumber = boss.type === 'B8' && Number.isInteger(boss.phaseIndex)
      ? boss.phaseIndex : ratio > 0.66 ? 0 : ratio > 0.33 ? 1 : 2;
    const phase = V.bossPhaseColors[phaseNumber] || V.bossPhaseColors[2];
    const left = (V.width - V.bossBarWidth) / 2;
    ctx.fillStyle = 'rgba(9,18,32,.87)';
    ctx.fillRect(left - 5, V.bossBarY - 5, V.bossBarWidth + 10, V.bossBarHeight + 10);
    ctx.strokeStyle = '#9caeb1';ctx.lineWidth = 1;
    ctx.strokeRect(left - 5.5,V.bossBarY - 5.5,V.bossBarWidth + 11,V.bossBarHeight + 11);
    ctx.fillStyle = '#24394a';ctx.fillRect(left,V.bossBarY,V.bossBarWidth,V.bossBarHeight);
    ctx.fillStyle = phase;ctx.fillRect(left,V.bossBarY,V.bossBarWidth * ratio,V.bossBarHeight);
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.textAlign = 'center';ctx.fillStyle = '#edf6ee';
    ctx.shadowColor = '#071522';ctx.shadowBlur = 5;
    ctx.fillText(t(`boss.${boss.type}`), V.width / 2, V.bossNameY);
    ctx.shadowBlur = 0;
  }

  render(game, dt, {t = (key) => key, reducedMotion = false} = {}) {
    this.resize();
    this.reducedMotion = reducedMotion;
    const frozen = game?.state === 'paused';
    this.paused = frozen;
    const step = frozen ? 0 : clamp(dt || 0, 0, V.maxFrameDelta) * (game?.slowMotion > 0 ? 0.35 : 1);
    if (!frozen) {
      this.elapsed += reducedMotion ? 0 : step;
      this.shake = Math.max(0, this.shake - step * V.shakeDecay);
      this.flash = Math.max(0, this.flash - step * (this.ring ? V.bossFlashFade : V.flashFade));
    }
    const ctx = this.ctx;
    ctx.save();
    this.drawSky(ctx);
    const playing = game && game.state !== 'menu';
    if (playing) {
      ctx.save();
      if (!reducedMotion && this.shake > 0 && !frozen) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      for (const item of game.obstacles || []) this.sprite(ctx, 'obstacle', item);
      for (const item of game.pickups || []) this.drawPickup(ctx, item);
      for (const enemy of game.enemies || []) {
        if (enemy.active === false || enemy.invisible || enemy === game.boss) continue;
        this.sprite(ctx, enemy.type, enemy);
      }
      if (!game.boss?.invisible) this.sprite(ctx, game.boss?.type, game.boss);
      if (game.player && !frozen) {
        if (this.lastPlayerX !== null && step > 0) {
          const target = clamp((game.player.x - this.lastPlayerX) / (step * V.bankVelocity), -1, 1);
          this.bank += (target - this.bank) * Math.min(1, step * V.bankResponse);
        }
        this.lastPlayerX = game.player.x;
      }
      this.drawShots(ctx, game.bullets);
      this.drawShots(ctx, game.enemyBullets, true);
      this.drawPlayer(ctx, game.player, true);
      this.drawParticles(ctx, step);
      for (const warning of game.warnings || []) {
        if (warning.active === false) continue;
        ctx.fillStyle = 'rgba(240,95,79,.22)';
        ctx.fillRect(warning.x - 24, 0, 48, V.height);
        ctx.strokeStyle = '#f9b189';ctx.lineWidth = 2;
        ctx.beginPath();ctx.moveTo(warning.x - 22, 5);ctx.lineTo(warning.x + 22, 5);ctx.stroke();
      }
      if (this.ring > 0) {
        const radius = (1 - this.ring) * V.ringSpeed;
        ctx.strokeStyle = `rgba(255,214,167,${this.ring * 0.7})`;
        ctx.lineWidth = 3 + this.ring * 5;
        ctx.beginPath();ctx.arc(this.ringX,this.ringY,radius,0,TAU);ctx.stroke();
        this.ring = Math.max(0, this.ring - step * 0.7);
      }
      ctx.restore();
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255,226,196,${Math.min(0.53,this.flash * 0.47)})`;
        ctx.fillRect(0,0,V.width,V.height);
      }
      this.drawBoss(ctx,game.boss,t);
      if (game.waveBanner > 0 && game.wave) {
        ctx.font = '700 24px system-ui, sans-serif';
        ctx.textAlign = 'center';ctx.fillStyle = '#e8ede4';
        ctx.shadowColor = '#0a1728';ctx.shadowBlur = 13;
        ctx.fillText(`${t('wave')} ${game.wave}`, V.width / 2, 104);
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }
}
