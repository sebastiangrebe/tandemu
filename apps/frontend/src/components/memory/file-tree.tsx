'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';
import type { FileTreeNode } from '@/lib/api';

interface FileTreeProps {
  tree: FileTreeNode[];
  onSelectPath: (path: string, memoryIds: string[]) => void;
  selectedPath?: string;
}

export function FileTree({ tree, onSelectPath, selectedPath }: FileTreeProps) {
  if (tree.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No file associations found. Memories will appear here once they have file metadata.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <FileTreeNodeComponent
          key={node.path}
          node={node}
          depth={0}
          onSelectPath={onSelectPath}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileTreeNode;
  depth: number;
  onSelectPath: (path: string, memoryIds: string[]) => void;
  selectedPath?: string;
}

function FileTreeNodeComponent({ node, depth, onSelectPath, selectedPath }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.children.length > 0;
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (isDir) {
      setExpanded(!expanded);
    }
    // Collect all memory IDs from this node and its descendants
    const allIds = collectMemoryIds(node);
    onSelectPath(node.path, allIds);
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-sm transition-colors hover:bg-accent ${
          isSelected ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        {isDir ? (
          <Folder className="h-4 w-4 shrink-0 text-blue-400" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate font-mono text-xs">{node.name}</span>
        <Badge variant="secondary" className="ml-auto text-xs shrink-0 h-5">
          {node.memoryCount}
        </Badge>
      </button>

      {expanded && isDir && (
        <div>
          {node.children.map((child) => (
            <FileTreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              onSelectPath={onSelectPath}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function collectMemoryIds(node: FileTreeNode): string[] {
  const ids = new Set(node.memoryIds);
  for (const child of node.children) {
    for (const id of collectMemoryIds(child)) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}
