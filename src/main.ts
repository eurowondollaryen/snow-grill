import './ui/hud.css';
import { Renderer } from './engine/Renderer';
import { DEBUG, Game } from './game/Game';
import { inputState } from './systems/InputState';
import { sound } from './systems/SoundSystem';
import { Hud } from './ui/Hud';

const stage = document.getElementById('stage')!;
const hudRoot = document.getElementById('hud')!;

const renderer = new Renderer(stage);
const game = new Game(renderer, hudRoot);
const hud = new Hud(hudRoot, game);

// 타이틀 화면: 살아있는 3D 캠프를 배경으로
const title = document.getElementById('title')!;
const d = game.state.data;
(title.querySelector('.sub') as HTMLElement).textContent =
  d.avatar.created ? `${d.avatar.name}님, 지역 ${d.stage} · ${game.state.stageName}  ★${d.stars}` : '사냥하고 · 굽고 · 팔아서 캠프를 키우자!';
document.getElementById('boot')?.remove();
title.classList.add('show');
document.body.classList.add('on-title');
let started = false;
const start = (): void => {
  if (started) return;
  started = true;
  sound.unlock();
  sound.click();
  title.classList.remove('show');
  title.classList.add('hide');
  document.body.classList.remove('on-title');
  setTimeout(() => title.remove(), 500);
  game.start();
  // 첫 실행이면 캐릭터 만들기부터
  if (!game.state.data.avatar.created) setTimeout(() => hud.openEditor(true), 450);
};
title.addEventListener('pointerdown', start);
window.addEventListener('keydown', start, { once: true });

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  hud.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (DEBUG) Object.assign(window as object, { game, hud, inputState, renderer });
