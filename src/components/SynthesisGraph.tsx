import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Synthesis } from '../types';

interface GraphProps {
  synthesis: Synthesis;
  width?: number;
  height?: number;
}

export function SynthesisGraph({ synthesis, width = 800, height = 500 }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !synthesis) return;

    const nodes: any[] = [];
    const nodeMap = new Map();
    const links: any[] = [];

    // The dark obsidian background colors
    const CLUSTER_COLOR = '#4f46e5'; // Indigo-600
    const IDEA_COLOR = '#a1a1aa'; // Zinc-400
    const TENSION_COLOR = '#fb7185'; // Rose-400
    const BG_COLOR = '#0f172a'; // keep it dark slate, but neutral

    synthesis.themeClusters.forEach((cluster) => {
      const clusterNode = {
        id: cluster.id,
        label: cluster.name,
        type: 'cluster',
        radius: 20 + Math.min(cluster.ideaNodes.length * 5, 30),
        color: CLUSTER_COLOR
      };
      nodes.push(clusterNode);
      nodeMap.set(clusterNode.id, clusterNode);

      cluster.ideaNodes.forEach(idea => {
        const ideaNode = {
          id: idea.id,
          label: idea.text.length > 25 ? idea.text.substring(0, 25) + '...' : idea.text,
          fullText: idea.text,
          type: 'idea',
          author: idea.author,
          radius: 12,
          color: IDEA_COLOR
        };
        nodes.push(ideaNode);
        nodeMap.set(ideaNode.id, ideaNode);

        links.push({
          source: idea.id,
          target: cluster.id,
          type: 'belongs_to',
          distance: 100
        });
      });
    });

    synthesis.relations.forEach((rel) => {
      const sourceIdea = nodes.find(n => n.type === 'idea' && n.fullText.includes(rel.sourceIdeaText));
      const targetIdea = nodes.find(n => n.type === 'idea' && n.fullText.includes(rel.targetIdeaText));
      
      if (sourceIdea && targetIdea) {
        links.push({
          source: sourceIdea.id,
          target: targetIdea.id,
          type: rel.type,
          label: rel.type,
          distance: 180
        });
      }
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.style('background-color', BG_COLOR);

    const g = svg.append('g');

    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (e) => {
        g.attr('transform', e.transform);
      }));

    // Glow filter
    const defs = svg.append("defs");
    const filter = defs.append("filter")
      .attr("id", "glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    
    filter.append("feGaussianBlur")
      .attr("stdDeviation", "8")
      .attr("result", "coloredBlur");
      
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance((d: any) => d.distance))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d: any) => d.radius + 15));

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke-width', (d: any) => d.type === 'tensions' ? 2 : 1)
      .attr('stroke', (d: any) => d.type === 'tensions' ? TENSION_COLOR : '#334155')
      .attr('stroke-dasharray', (d: any) => d.type === 'uncertain' ? '5,5' : 'none')
      .attr('opacity', 0.6);

    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('r', (d: any) => d.radius)
      .attr('fill', (d: any) => d.color)
      .attr('opacity', 0.9)
      .attr('stroke', (d: any) => d.type === 'cluster' ? '#818cf8' : '#e4e4e7')
      .attr('stroke-width', (d: any) => d.type === 'cluster' ? 2 : 0)
      .style("filter", (d: any) => d.type === 'cluster' ? "url(#glow)" : "none")
      .call(d3.drag<SVGCircleElement, unknown>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any);

    // Interaction effects
    node.on('mouseover', function(event, d: any) {
        d3.select(this).attr('opacity', 1).attr('stroke-width', 3);
        const connectedIds = new Set();
        connectedIds.add(d.id);
        
        link.attr('opacity', (l: any) => {
          if (l.source.id === d.id || l.target.id === d.id) {
            connectedIds.add(l.source.id);
            connectedIds.add(l.target.id);
            return 1;
          }
          return 0.1;
        });

        node.attr('opacity', (n: any) => connectedIds.has(n.id) ? 1 : 0.2);
        labels.attr('opacity', (n: any) => connectedIds.has(n.id) ? 1 : 0.2);
      })
      .on('mouseout', function() {
        d3.select(this).attr('stroke-width', (d: any) => d.type === 'cluster' ? 2 : 0);
        link.attr('opacity', 0.6);
        node.attr('opacity', 0.9);
        labels.attr('opacity', 1);
      });

    const labels = g.append('g')
      .selectAll('text')
      .data(nodes)
      .enter().append('text')
      .text((d: any) => d.label)
      .attr('font-size', (d: any) => d.type === 'cluster' ? '14px' : '11px')
      .attr('font-family', 'sans-serif')
      .attr('text-anchor', 'middle')
      .attr('fill', (d: any) => d.type === 'cluster' ? '#f8fafc' : '#cbd5e1')
      .attr('dy', (d: any) => d.radius + 15)
      .style('pointer-events', 'none')
      .style('text-shadow', '0px 2px 4px rgba(0,0,0,0.8)');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [synthesis, width, height]);

  return (
    <div className="w-full h-full relative overflow-hidden rounded-xl border border-slate-800 shadow-2xl">
        <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0" />
    </div>
  );
}
