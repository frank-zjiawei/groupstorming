import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { BubbleState, BubbleLink } from '../types';
import { BUBBLE_PALETTE, AI_BUBBLE_COLOR, DISTILLED_BUBBLE_COLOR, colorIndexFor } from '../data/contributorPalette';

interface LiveBubblesProps {
  bubbles: BubbleState[];
  links?: BubbleLink[];
  onBubbleClick?: (bubble: BubbleState) => void;
  onMergeBubbles?: (sourceId: string, targetId: string) => void;
  onBubbleRightClick?: (bubbleId: string, clientX: number, clientY: number) => void;
  onBubbleDoubleClick?: (bubble: BubbleState) => void;
  filterSpeaker?: string | null;
  zoom?: number;
  // Sorted master list of contributors so colors are stable across the app
  knownContributors?: string[];
}

export function LiveBubbles({
  bubbles,
  links = [],
  onBubbleClick,
  onMergeBubbles,
  onBubbleRightClick,
  onBubbleDoubleClick,
  filterSpeaker,
  zoom = 1,
  knownContributors = [],
}: LiveBubblesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<BubbleState, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    
    // Filter bubbles and links based on speaker filter
    const activeBubbles = filterSpeaker 
      ? bubbles.filter(b => b.contributors.includes(filterSpeaker))
      : bubbles;

    const activeBubbleIds = new Set(activeBubbles.map(b => b.id));
    const activeLinks = links.filter(l => activeBubbleIds.has(l.source) && activeBubbleIds.has(l.target));

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 450;
    const svg = d3.select(svgRef.current);

    // Set explicit size to let D3 zoom measure correctly
    svg.attr('width', width).attr('height', height);

    // Filter out invalid nodes
    const validBubbles = activeBubbles.filter(b => b && b.id);
    const validLinks = activeLinks.filter(l => validBubbles.find(b => b.id === l.source) && validBubbles.find(b => b.id === l.target)).map(d => Object.assign({}, d));

    // Use the shared palette + master contributor list so colors are stable
    // across bubbles / sidebar / filter dropdown / transcript text.
    const masterList = knownContributors.length > 0
      ? knownContributors
      : Array.from(new Set(validBubbles.flatMap(b => b.contributors)))
          .filter(c => c && !c.includes('AI') && c !== 'unknown' && c !== 'Distilled')
          .sort();
    const colorFor = (contributor: string) => BUBBLE_PALETTE[colorIndexFor(contributor, masterList)];

    if (!simulationRef.current) {
      simulationRef.current = d3.forceSimulation<BubbleState>(validBubbles)
        .force("link", d3.forceLink(validLinks).id((d: any) => d.id).distance(160).strength(0.7))
        .force("charge", d3.forceManyBody().strength(-450))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.008))
        .force("collide", d3.forceCollide<BubbleState>().radius(d => d.radius + 35).iterations(4))
        .alphaDecay(0.1)
        .velocityDecay(0.7);
    } else {
      // Initialize position for new bubbles to slide from the side
      validBubbles.forEach(d => {
        if (d.x === undefined || d.y === undefined) {
          d.x = width / 2 + (Math.random() - 0.5) * 100;
          d.y = height / 2 + (Math.random() - 0.5) * 100;
        }
      });
      simulationRef.current.nodes(validBubbles);
      const linkForce = simulationRef.current.force<d3.ForceLink<any, any>>("link");
      if (linkForce) linkForce.links(validLinks);
      simulationRef.current.alpha(0.1).restart(); // Lower alpha restart
    }

    // Setup zoom
    if (!zoomRef.current) {
       zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
         .scaleExtent([0.2, 3])
         .extent([[0, 0], [width, height]])
         .on("zoom", (event) => {
           svg.select('g.main-container').attr('transform', event.transform);
         });
       svg.call(zoomRef.current);
    } else {
       zoomRef.current.extent([[0, 0], [width, height]]);
    }

    // Sync external zoom prop with d3 zoom
    // Only transition if the change is significant and not on first run
    if (zoomRef.current) {
       svg.call(zoomRef.current.scaleTo, zoom);
    }

    // Update zoom manually if external prop changes (though we have internal d3 zoom now)
    // we use d3 zoom for "drag around canvas"
    
    // Setup filters & gradients
    if (svg.select('defs').empty() || svg.select('#watercolor-cloud').empty()) {
       const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
       
       // Watercolor filter for the clouds
       const clusterFilter = defs.append('filter')
         .attr('id', 'watercolor-cloud')
         .attr('x', '-70%') // even wider for turbulence
         .attr('y', '-70%')
         .attr('width', '240%')
         .attr('height', '240%');

       clusterFilter.append('feTurbulence')
         .attr('type', 'fractalNoise')
         .attr('baseFrequency', '0.015') // Lower frequency for larger blobs
         .attr('numOctaves', '5')
         .attr('result', 'baseNoise');
         
       clusterFilter.append('feDisplacementMap')
         .attr('in', 'SourceGraphic')
         .attr('in2', 'baseNoise')
         .attr('scale', '80') // Increased displacement for more "cloudy" edges
         .attr('xChannelSelector', 'R')
         .attr('yChannelSelector', 'G');
         
       clusterFilter.append('feGaussianBlur')
         .attr('stdDeviation', '12') // Softer edges
         .attr('result', 'blur');

       clusterFilter.append('feComponentTransfer')
         .attr('in', 'blur')
         .append('feFuncA')
         .attr('type', 'linear')
         .attr('slope', '0.9'); // Higher opacity for "evident" background
    }

    // -- RENDERING LAYERS --
    let mainContainer = svg.select<SVGGElement>('g.main-container');
    if (mainContainer.empty()) {
      mainContainer = svg.append('g').attr('class', 'main-container');
    }

    // 0. Cloud Layer (Clusters) - rendered first (at the bottom)
    let cloudLayer = mainContainer.select<SVGGElement>('g.cloud-layer');
    if (cloudLayer.empty()) {
      cloudLayer = mainContainer.append('g').attr('class', 'cloud-layer');
    }

    // Calculate clusters using simple connectivity (Union-Find or DFS)
    const bubbleMap = new Map(validBubbles.map(b => [b.id, b]));
    const parent = new Map<string, string>();
    validBubbles.forEach(b => parent.set(b.id, b.id));
    
    const find = (i: string): string => {
      if (parent.get(i) === i) return i;
      const root = find(parent.get(i)!);
      parent.set(i, root);
      return root;
    };
    
    const union = (i: string, j: string) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) parent.set(rootI, rootJ);
    };

    validLinks.forEach(l => {
      const sId = (l.source as any).id || l.source;
      const tId = (l.target as any).id || l.target;
      if (parent.has(sId) && parent.has(tId)) {
        union(sId, tId);
      }
    });

    const clusters = new Map<string, BubbleState[]>();
    validBubbles.forEach(b => {
      const root = find(b.id);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(b);
    });

    const clusterData: { id: string, nodes: BubbleState[], color: string }[] = [];
    
    Array.from(clusters.entries())
      .filter(([_, nodes]) => nodes.length > 0)
      .forEach(([clusterId, nodes]) => {
        // Find all unique contributors in this cluster
        const contributors = Array.from(new Set(nodes.flatMap(n => n.contributors)));

        contributors.forEach(contributor => {
          const contributorNodes = nodes.filter(n => n.contributors.includes(contributor));
          if (contributorNodes.length === 0) return;

          // AI Brainstorm: each suggestion gets its OWN small cloud, not one
          // big lump that visually merges them.
          if (contributor === 'AI Brainstorm') {
            contributorNodes.forEach((n, i) => {
              clusterData.push({ id: `${clusterId}-AI-${n.id}`, nodes: [n], color: AI_BUBBLE_COLOR });
            });
            return;
          }

          let color: string;
          if (contributor === 'Distilled') {
            color = DISTILLED_BUBBLE_COLOR;
          } else {
            color = colorFor(contributor);
          }

          clusterData.push({
            id: `${clusterId}_${contributor}`,
            nodes: contributorNodes,
            color: color,
          });
        });
      });

    const clouds = cloudLayer.selectAll<SVGPathElement, any>('path.cluster-cloud')
      .data(clusterData, d => d.id);

    const cloudEnter = clouds.enter().append('path')
      .attr('class', 'cluster-cloud')
      .style('filter', 'url(#watercolor-cloud)')
      .style('opacity', 0)
      // Use mix-blend-mode to make overlaps interesting but distinct
      .style('mix-blend-mode', 'multiply') 
      .attr('fill', d => d.color);

    cloudEnter.transition().duration(1000).style('opacity', 0.55);

    const cloudUpdate = cloudEnter.merge(clouds as any)
      .attr('fill', d => d.color);

    clouds.exit().transition().duration(500).style('opacity', 0).remove();

    // 1. Background Layer (Shapes & Links)
    let bgLayer = mainContainer.select<SVGGElement>('g.bg-layer');
    if (bgLayer.empty()) {
      bgLayer = mainContainer.append('g').attr('class', 'bg-layer');
    }

    // Links inside Background Layer
    let linkGroup = bgLayer.select<SVGGElement>('g.link-group');
    if (linkGroup.empty()) {
      linkGroup = bgLayer.append('g').attr('class', 'link-group').lower();
    }

    const linkPaths = linkGroup.selectAll<SVGPathElement, any>('path.bubble-link')
      .data(validLinks, d => `${(d.source as any).id || d.source}-${(d.target as any).id || d.target}`);

    const linkEnter = linkPaths.enter().append('path')
      .attr('class', 'bubble-link')
      .attr('fill', 'none')
      .attr('stroke', '#94a3b8') // slate-400 — light, subtle thread
      .attr('stroke-width', 1.5)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0);

    linkEnter.transition().duration(700)
      .attr('opacity', 0.4);

    const linkUpdate = linkEnter.merge(linkPaths as any);
    linkPaths.exit().transition().duration(400).attr('opacity', 0).remove();

    // Bubble Background Shapes
    let bubbleBgGroup = bgLayer.select<SVGGElement>('g.bubble-bg-group');
    if (bubbleBgGroup.empty()) {
      bubbleBgGroup = bgLayer.append('g').attr('class', 'bubble-bg-group');
    }

    // 2. Foreground Layer (Text only, shapes are styled by background layer and SVG filters)
    let fgGroup = mainContainer.select<SVGGElement>('g.fg-layer');
    if (fgGroup.empty()) {
      fgGroup = mainContainer.append('g').attr('class', 'fg-layer').style('pointer-events', 'none');
    }

    // Apply zoom prop transformation if set (as an additional multiplier or base)
    // d3 zoom handles the main panning, let's just make sure it stays integrated.

    const nodeBg = bubbleBgGroup.selectAll<SVGGElement, BubbleState>('g.bubble-bg-node')
      .data(validBubbles, d => d.id);

    const nodeBgEnter = nodeBg.enter()
      .append('g')
      .attr('class', 'bubble-bg-node')
      .style('cursor', 'grab')
      .style('mix-blend-mode', 'normal')
      .on('dblclick', (event, d) => {
         event.preventDefault();
         if (onBubbleDoubleClick) onBubbleDoubleClick(d);
      })
      .call(d3.drag<SVGGElement, BubbleState>()
        .on("start", function(event, d) {
          if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
          d3.select(this).style('cursor', 'grabbing');
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", function(event, d) {
          if (!event.active) simulationRef.current?.alphaTarget(0);
          d3.select(this).style('cursor', 'grab');
          
          if (onMergeBubbles) {
             const overlapping = validBubbles.find(b => 
                b.id !== d.id && 
                Math.hypot((b.x || 0) - (d.x || 0), (b.y || 0) - (d.y || 0)) < Math.max(b.radius, d.radius) * 1.2
             );
             if (overlapping) {
                onMergeBubbles(d.id, overlapping.id);
             }
          }
        })
      );

    const getBubbleColor = (d: BubbleState) => {
       const isBrainstorm = d.contributors.includes('AI Brainstorm');
       if (isBrainstorm) return AI_BUBBLE_COLOR;
       const isDistilled = d.contributors.includes('Distilled');
       if (isDistilled) return DISTILLED_BUBBLE_COLOR;

       const human = d.contributors.find(c => c && !c.includes('AI') && c !== 'unknown' && c !== 'Distilled');
       if (human) return colorFor(human);
       return BUBBLE_PALETTE[0];
    };

    // Helper for stroke color
    const getStrokeColor = (d: BubbleState) => {
       const isBrainstorm = d.contributors.includes('AI Brainstorm');
       if (isBrainstorm) return '#475569'; // Slate-600 stroke for AI bubbles
       const fill = getBubbleColor(d);
       return d3.color(fill)?.darker(1.2).formatHex() || '#334155';
    };

    // Filter for bubble shadow
    if (svg.select('#bubble-shadow').empty()) {
      const filter = svg.select('defs').append('filter')
        .attr('id', 'bubble-shadow')
        .attr('x', '-50%')
        .attr('y', '-50%')
        .attr('width', '200%')
        .attr('height', '200%');
      
      filter.append('feDropShadow')
        .attr('dx', '0')
        .attr('dy', '2')
        .attr('stdDeviation', '3')
        .attr('flood-opacity', '0.15');
    }

    const rectEnter = nodeBgEnter.append('rect')
      .attr('class', 'bubble-bg')
      .attr('fill', getBubbleColor)
      .attr('stroke', getStrokeColor)
      .attr('stroke-width', 2)
      .attr('filter', 'url(#bubble-shadow)')
      .attr('x', d => d.isPill ? -d.radius * 2 : -d.radius)
      .attr('y', d => -d.radius)
      .attr('width', d => d.isPill ? d.radius * 4 : d.radius * 2)
      .attr('height', d => d.radius * 2)
      .attr('rx', d => d.radius)
      .attr('opacity', 0);

    rectEnter.transition()
      .duration(800) // Longer slide duration
      .ease(d3.easeCubicOut)
      .attr('opacity', 0.75);

    const nodeBgUpdate = nodeBgEnter.merge(nodeBg);
    
    // Right-click opens an action menu (handled by parent)
    nodeBgUpdate.on('contextmenu', (event, d) => {
       event.preventDefault(); // Prevent standard browser menu
       if (onBubbleRightClick) {
          onBubbleRightClick(d.id, event.clientX, event.clientY);
       }
    });

    const rectUpdate = nodeBgUpdate.select('rect');

    // Dynamic color update if merged
    rectUpdate.attr('fill', getBubbleColor)
      .attr('stroke', getStrokeColor);
      
    rectUpdate.transition().duration(600).ease(d3.easeCubicOut)
      .attr('x', d => d.isPill ? -d.radius * 1.5 : -d.radius)
      .attr('y', d => -d.radius)
      .attr('width', d => d.isPill ? d.radius * 3 : d.radius * 2)
      .attr('height', d => d.radius * 2)
      .attr('rx', d => d.radius);
    
    nodeBg.exit().transition().duration(400)
      .select('rect').attr('width', 0).attr('height', 0);
    nodeBg.exit().transition().delay(400).remove();

    // 2. Foreground Layer (Text only, shapes are styled by background layer and SVG filters)
    // fgGroup moved up for zoom transform

    const nodeFg = fgGroup.selectAll<SVGGElement, BubbleState>('g.bubble-fg')
      .data(validBubbles, d => d.id);
      
    const nodeFgEnter = nodeFg.enter().append('g').attr('class', 'bubble-fg');

    // Text label via foreignObject for better wrapping
    const fo = nodeFgEnter.append('foreignObject')
      .attr('class', 'bubble-text')
      .attr('x', d => d.isPill ? -d.radius * 1.5 : -d.radius)
      .attr('y', d => -d.radius)
      .attr('width', d => d.isPill ? d.radius * 3 : d.radius * 2)
      .attr('height', d => d.radius * 2)
      .style('pointer-events', 'none')
      .style('overflow', 'visible');
      
    const foDiv = fo.append('xhtml:div')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('justify-content', 'center')
      .style('width', '100%')
      .style('height', '100%')
      .style('padding', '16px')
      .style('text-align', 'center')
      .style('box-sizing', 'border-box');
      
    foDiv.append('xhtml:span')
      .style('font-size', d => Math.max(11, Math.min(14, d.radius / 4.5)) + 'px')
      .style('font-weight', '500')
      .style('color', '#0f172a')
      .style('font-family', '"Inter", sans-serif')
      .style('word-wrap', 'break-word')
      .style('display', 'block')
      .style('overflow', 'visible')
      .style('text-shadow', '0 1px 1px rgba(255,255,255,0.5)')
      .text(d => d.summary);

    // Update selection (merging/growing logic)
    const nodeFgUpdate = nodeFgEnter.merge(nodeFg as any);

    // Ripple Effect on growth
    nodeFgUpdate.each(function(d) {
       const nodeGroup = d3.select(this);
       if (d._prevRadius && d.radius > d._prevRadius) {
         nodeGroup.insert('circle', 'text')
           .attr('r', d._prevRadius)
           .attr('fill', 'none')
           .attr('stroke', '#4f46e5')
           .attr('stroke-width', 2)
           .attr('opacity', 0.8)
           .transition().duration(1000).ease(d3.easeCubicOut)
           .attr('r', d.radius + 40)
           .attr('opacity', 0)
           .remove();
       }
       d._prevRadius = d.radius;
    });

    const foUpdate = nodeFgUpdate.select('foreignObject.bubble-text');
    foUpdate.transition().duration(600)
      .attr('x', d => d.isPill ? -d.radius * 1.5 : -d.radius)
      .attr('y', d => -d.radius)
      .attr('width', d => d.isPill ? d.radius * 3 : d.radius * 2)
      .attr('height', d => d.radius * 2);
      
    foUpdate.select('span')
      .text(d => d.summary)
      .style('font-size', d => Math.max(11, Math.min(14, d.radius / 4.5)) + 'px');

    // Tooltip for bubbles
    nodeBgUpdate.each(function(d) {
      const bg = d3.select(this);
      if (bg.select('title').empty()) {
         bg.append('title');
      }
      bg.select('title').text(`${d.summary}\nContributors: ${d.contributors.join(', ')}`);
    });

    // Exit selection
    nodeFg.exit()
      .transition().duration(400)
      .attr('transform', (d: any) => `translate(${d.x},${d.y}) scale(0)`)
      .remove();

    // Simulation tick
    simulationRef.current.on('tick', () => {
      // Auto-fix nodes when they stabilize to keep them static
      if (simulationRef.current && simulationRef.current.alpha() < 0.02) {
         validBubbles.forEach(d => {
            if (d.x !== undefined && d.y !== undefined) {
               d.fx = d.x;
               d.fy = d.y;
            }
         });
      }

      // Soft bounds — allow bubbles to drift right up to the edges and a little
      // beyond (d3 zoom can pan to follow them). No more "invisible wall" feel.
      const overflow = 80;
      validBubbles.forEach(d => {
        d.x = Math.max(-overflow, Math.min(width + overflow, d.x || 0));
        d.y = Math.max(-overflow, Math.min(height + overflow, d.y || 0));
      });

      linkUpdate.attr('d', (d: any) => {
          if (!d.source || !d.target || d.source.x === undefined || d.target.x === undefined) {
             return "";
          }
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dr = Math.sqrt(dx * dx + dy * dy) * 1.5; // curved arc
          return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });

      // Update clouds
      cloudUpdate.attr('d', (d: any) => {
        if (!d.nodes || d.nodes.length === 0) return "";
        
        // Extract center points
        const points: [number, number][] = d.nodes.map((n: any) => [n.x || 0, n.y || 0]);
        
        if (points.length === 1) {
          const [x, y] = points[0];
          const r = (d.nodes[0].radius || 40) + 40;
          return `M ${x-r},${y} a ${r},${r} 0 1,0 ${r*2},0 a ${r},${r} 0 1,0 ${-r*2},0`;
        }
        
        if (points.length === 2) {
          const [x1, y1] = points[0];
          const [x2, y2] = points[1];
          const r = Math.max(d.nodes[0].radius, d.nodes[1].radius) + 45;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx*dx + dy*dy);
          const nx = -dy / len * r;
          const ny = dx / len * r;
          
          return `M ${x1+nx},${y1+ny} A ${r},${r} 0 1,1 ${x1-nx},${y1-ny} L ${x2-nx},${y2-ny} A ${r},${r} 0 1,1 ${x2+nx},${y2+ny} Z`;
        }

        const hull = d3.polygonHull(points);
        if (!hull) return "";

        // Expand hull so cloud comfortably wraps every node + its bubble radius
        const centroid = d3.polygonCentroid(hull);
        const maxRadius = Math.max(...d.nodes.map((n: any) => n.radius || 50));
        const expandedHull = hull.map(p => {
          const dx = p[0] - centroid[0];
          const dy = p[1] - centroid[1];
          const mag = Math.sqrt(dx*dx + dy*dy) || 1;
          const expansion = maxRadius + 40;
          return [p[0] + (dx/mag) * expansion, p[1] + (dy/mag) * expansion];
        });

        const line = d3.line().curve(d3.curveBasisClosed);
        return line(expandedHull as any);
      });

      nodeBgUpdate.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
      nodeFgUpdate.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    nodeBgUpdate.on('click', (event, d) => {
       if (event.defaultPrevented) return; // Dragged
       if (onBubbleClick) onBubbleClick(d);
    });

    nodeBgUpdate
      .on('mouseenter', function() {
        d3.select(this).select('rect')
           .transition().duration(200)
           .attr('stroke', '#6366f1') // slight outline on hover
           .attr('stroke-width', 2);
      })
      .on('mouseleave', function() {
        d3.select(this).select('rect')
           .transition().duration(200)
           .attr('stroke', (d: any) => getStrokeColor(d))
           .attr('stroke-width', 2);
      });

  }, [bubbles, links, onBubbleClick, onMergeBubbles, onBubbleRightClick, onBubbleDoubleClick, filterSpeaker, zoom]);

  return (
    <div className="w-full h-full relative overflow-hidden rounded-2xl border border-white/40 bg-white/40 backdrop-blur-sm shadow-inner">
      
      {/* Background decoration elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.05]">
        <svg width="100%" height="100%">
           <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
             <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#4f46e5" strokeWidth="1"/>
           </pattern>
           <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <svg 
        ref={svgRef} 
        className="absolute inset-0 w-full h-full z-10"
      />
    </div>
  );
}
