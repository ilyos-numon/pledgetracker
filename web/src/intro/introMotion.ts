import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { formatCount } from '../../../src/core/tracked.ts';

// 소개 페이지(/) 스크롤 애니메이션. opacity/transform 만 바꾸고 텍스트를 DOM 에서 빼거나 숨기지 않는다.
// reduced-motion 이면 tween·pin 을 하나도 만들지 않는다 (모든 단계 data-state="on").

gsap.registerPlugin(ScrollTrigger);

export const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';
const MOBILE_WIDTH = 768;
const STEP_OFF_OPACITY = 0.4;

const active = new WeakMap<HTMLElement, gsap.MatchMedia>();

function steps(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="how-step-"]'));
}

function setStepState(step: HTMLElement, on: boolean, animate: boolean): void {
  const next = on ? 'on' : 'off';
  if (animate && step.dataset.state === next) return;
  step.dataset.state = next;
  const vars = { opacity: on ? 1 : STEP_OFF_OPACITY, y: on ? 0 : 12, overwrite: 'auto' as const };
  if (animate) gsap.to(step, { ...vars, duration: 0.45, ease: 'power2.out' });
  else gsap.set(step, vars);
  const mark = step.querySelector<HTMLElement>('[data-step-mark]');
  if (mark) {
    const markVars = { opacity: on ? 1 : 0, scale: on ? 1 : 0.6, overwrite: 'auto' as const };
    if (animate) gsap.to(mark, { ...markVars, duration: 0.35, ease: 'back.out(2)' });
    else gsap.set(mark, markVars);
  }
}

function heroIntro(root: HTMLElement): void {
  const chars = root.querySelectorAll<HTMLElement>('[data-intro-char]');
  const fades = root.querySelectorAll<HTMLElement>('[data-intro-fade]');
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  if (chars.length > 0) {
    tl.from(chars, { opacity: 0, yPercent: 60, rotate: 4, duration: 0.6, stagger: 0.04 });
  }
  if (fades.length > 0) {
    tl.from(fades, { opacity: 0, y: 16, duration: 0.6, stagger: 0.12 }, '-=0.25');
  }
}

function stepsPin(root: HTMLElement): void {
  const section = root.querySelector<HTMLElement>('[data-testid="intro-steps"]');
  const list = steps(root);
  if (!section || list.length === 0) return;
  const bar = section.querySelector<HTMLElement>('[data-steps-progress]');
  const n = list.length;

  list.forEach((step, i) => {
    setStepState(step, i === 0, false);
  });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => `+=${Math.round(window.innerHeight * n * (window.innerWidth < MOBILE_WIDTH ? 0.4 : 0.6))}`,
      pin: true,
      scrub: 0.4,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        // 진행도 0 이면 첫 단계, 1 이면 다섯 단계 모두 켜진다.
        const lit = Math.min(n, Math.floor(self.progress * n) + 1);
        list.forEach((step, i) => {
          setStepState(step, i < lit, true);
        });
      },
    },
  });
  if (bar) tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, ease: 'none', transformOrigin: 'left center' });
  else tl.to({}, { duration: 1 });
}

export function setupIntroMotion(root: HTMLElement): () => void {
  const mm = gsap.matchMedia();
  const ctx = gsap.context(() => {
    mm.add(MOTION_QUERY, () => {
      heroIntro(root);
      stepsPin(root);
      return () => {
        // 모션이 꺼지거나 언마운트되면 최종 상태로 돌려 둔다.
        for (const step of steps(root)) step.dataset.state = 'on';
      };
    });
  }, root);
  if (!window.matchMedia(MOTION_QUERY).matches) {
    for (const step of steps(root)) step.dataset.state = 'on';
  }
  active.set(root, mm);
  return () => {
    if (active.get(root) === mm) active.delete(root);
    mm.revert();
    ctx.revert();
  };
}

function textNode(el: HTMLElement): Text | null {
  const node = el.firstChild;
  return node && node.nodeType === Node.TEXT_NODE ? (node as Text) : null;
}

export function animateCounters(root: HTMLElement): void {
  const mm = active.get(root);
  if (!mm) return;
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-count-to]'));
  if (els.length === 0) return;
  mm.add(MOTION_QUERY, () => {
    const finals: [Text, string][] = [];
    for (const el of els) {
      const to = Number(el.dataset.countTo);
      const node = textNode(el);
      if (!node || !Number.isFinite(to)) continue;
      finals.push([node, node.nodeValue ?? '']);
      node.nodeValue = formatCount(0);
      const counter = { v: 0 };
      gsap.to(counter, {
        v: to,
        duration: 1.6,
        ease: 'power2.out',
        onUpdate: () => {
          node.nodeValue = formatCount(Math.round(counter.v));
        },
        onComplete: () => {
          node.nodeValue = formatCount(to);
        },
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });
    }
    return () => {
      // 언마운트·모션 해제 시 최종 숫자를 남긴다.
      for (const [node, text] of finals) node.nodeValue = text;
    };
  });
  ScrollTrigger.refresh();
}
