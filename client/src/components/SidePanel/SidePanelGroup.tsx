import { useState, useRef, useLayoutEffect, memo } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';
import { ResizablePanel, ResizablePanelGroup, useMediaQuery } from '@librechat/client';
import { TRANSITION_MS, EASING } from '~/components/UnifiedSidebar/constants';
import { ARTIFACTS_SHEET_MAX_WIDTH } from '~/utils/breakpoints';
import useScaledMaxWidth from '~/hooks/useScaledMaxWidth';
import useDirection from '~/hooks/Nav/useDirection';
import ArtifactsPanel from './ArtifactsPanel';

const PANEL_IDS_SINGLE = ['messages-view'];
/** Keep the persisted id stable so existing artifact panel widths carry over. */
const PANEL_IDS_SPLIT = ['messages-view', 'artifacts-panel'];
const PANEL_IDS_SPLIT_RTL = ['artifacts-panel', 'messages-view'];

interface SidePanelProps {
  panel?: React.ReactNode;
  children: React.ReactNode;
  layoutId?: string;
  defaultPanelSize?: string;
}

const SidePanelGroup = memo(
  ({
    panel,
    children,
    layoutId = 'side-panel-layout',
    defaultPanelSize = '50',
  }: SidePanelProps) => {
    const [shouldRenderPanel, setShouldRenderPanel] = useState(panel != null);
    const lastPanel = useRef({ panel, layoutId, defaultPanelSize });
    const host = useRef<HTMLDivElement>(null);
    const overlay = useRef<HTMLDivElement>(null);
    const interrupted = useRef<number[] | null>(null);
    const interruptedSlide = useRef<string | null>(null);
    const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const open = panel != null;
    if (open) lastPanel.current = { panel, layoutId, defaultPanelSize };
    const animateSpace =
      layoutId === 'personal-space-layout' ||
      (!open && shouldRenderPanel && lastPanel.current.layoutId === 'personal-space-layout');
    const visible = open || (animateSpace && shouldRenderPanel);
    const displayedPanel = panel ?? (visible ? lastPanel.current.panel : null);
    const activeLayoutId = visible ? lastPanel.current.layoutId : layoutId;
    const activePanelSize = visible ? lastPanel.current.defaultPanelSize : defaultPanelSize;
    const isSmallScreen = useScaledMaxWidth(ARTIFACTS_SHEET_MAX_WIDTH);
    /**
     * react-resizable-panels reads drag deltas and arrow keys physically (a
     * rightward drag always grows the first panel), so under RTL the group stays
     * LTR and the panels are rendered in reverse: the artifacts panel lands on
     * the inline-end side and every drag still moves the separator with the
     * pointer. Each panel restores the document direction for its content. The
     * library keys the saved layout by panel order, so RTL keeps its own widths.
     */
    const direction = useDirection();
    const reversed = direction === 'rtl';
    const splitIds = reversed ? PANEL_IDS_SPLIT_RTL : PANEL_IDS_SPLIT;

    useLayoutEffect(() => {
      if (!animateSpace) return;
      if (open) setShouldRenderPanel(true);
      const nodes = isSmallScreen
        ? [overlay.current].filter((node): node is HTMLDivElement => node != null)
        : Array.from(
            host.current?.querySelectorAll<HTMLElement>(':scope > [data-group] > [data-panel]') ??
              [],
          );
      if (reducedMotion || nodes.length === 0) {
        setShouldRenderPanel(open);
        return;
      }
      // Animate presentation only: never persist collapsed/intermediate drag sizes.
      const previous = interrupted.current;
      const previousSlide = interruptedSlide.current;
      interrupted.current = null;
      interruptedSlide.current = null;
      const animations = nodes.map((node, index) => {
        if (isSmallScreen) {
          const outside = reversed ? '-100%' : '100%';
          return node.animate(
            {
              transform: [
                previousSlide ?? (open ? `translateX(${outside})` : 'translateX(0)'),
                open ? 'translateX(0)' : `translateX(${outside})`,
              ],
            },
            { duration: TRANSITION_MS, easing: EASING, fill: 'both' },
          );
        }
        const target = Number(getComputedStyle(node).flexGrow);
        const collapsed = node.id === 'messages-view' ? 100 : 0;
        return node.animate(
          {
            flexGrow: [previous?.[index] ?? (open ? collapsed : target), open ? target : collapsed],
          },
          { duration: TRANSITION_MS, easing: EASING, fill: 'both' },
        );
      });
      // Registration settles the resizer's percentage layout before the first frame.
      if (open && !isSmallScreen) animations.forEach((animation) => animation.pause());
      const frame = requestAnimationFrame(() => {
        if (!open || isSmallScreen) return;
        animations.forEach((animation, index) => {
          if (animation.effect instanceof KeyframeEffect) {
            animation.effect.setKeyframes([
              { flexGrow: previous?.[index] ?? (nodes[index].id === 'messages-view' ? 100 : 0) },
              { flexGrow: Number(nodes[index].style.flexGrow) },
            ]);
          }
          animation.play();
        });
      });
      let finished = false;
      void Promise.all(animations.map((animation) => animation.finished))
        .then(() => {
          finished = true;
          if (!open) setShouldRenderPanel(false);
          else animations.forEach((animation) => animation.cancel());
        })
        .catch(() => {});
      return () => {
        cancelAnimationFrame(frame);
        if (!finished && !isSmallScreen) {
          interrupted.current = nodes.map((node) => Number(getComputedStyle(node).flexGrow));
        } else if (!finished && nodes[0]) {
          interruptedSlide.current = getComputedStyle(nodes[0]).transform;
        }
        animations.forEach((animation) => animation.cancel());
      };
    }, [open, animateSpace, isSmallScreen, reducedMotion, reversed]);

    const { defaultLayout, onLayoutChanged } = useDefaultLayout({
      id: activeLayoutId,
      panelIds: visible ? splitIds : PANEL_IDS_SINGLE,
      storage: localStorage,
    });

    const minSizeMain = visible ? '15' : '30';

    const panels = [
      <ResizablePanel
        key="messages"
        defaultSize={activePanelSize === '50' ? '50' : undefined}
        minSize={minSizeMain}
        id="messages-view"
        dir={direction}
      >
        {children}
      </ResizablePanel>,
      !isSmallScreen && (
        <ArtifactsPanel
          key="artifacts"
          panel={animateSpace ? displayedPanel : panel}
          minSizeMain={minSizeMain}
          shouldRender={animateSpace ? visible : shouldRenderPanel}
          managePresence={!animateSpace}
          inert={animateSpace && !open}
          onRenderChange={setShouldRenderPanel}
          reversed={reversed}
          defaultSize={activePanelSize}
        />
      ),
    ];

    return (
      <>
        {/* The surface behind the panels is this group's host, not the group
          primitive: the resizer owns its own chrome, and the caller owns the
          backdrop the panels sit on. */}
        <div ref={host} className="relative min-w-0 flex-1">
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={animateSpace ? undefined : defaultLayout}
            onLayoutChanged={animateSpace ? undefined : onLayoutChanged}
            dir="ltr"
          >
            {reversed ? panels.reverse() : panels}
          </ResizablePanelGroup>
        </div>
        {visible && isSmallScreen && (
          <div ref={overlay} inert={!open ? '' : undefined} className="fixed inset-0 z-[100]">
            {displayedPanel}
          </div>
        )}
      </>
    );
  },
);

SidePanelGroup.displayName = 'SidePanelGroup';

export default SidePanelGroup;
