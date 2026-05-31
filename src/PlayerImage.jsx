import React, { useState } from "react";
import { T } from "./Theme";

function PlayerImage({ player, size = 100, borderRadius = 12, teamColor = T.accent, showBackground = true }) {
  const [imageError, setImageError] = useState(false);
  
  const imageUrl = (player?.imageUrl || player?.image) ? `${player?.imageUrl || player?.image}?v=2` : null;
  const showFallback = !imageUrl || imageError;
  
  // Handle both fixed size (number) and responsive size (string like "100%")
  const isResponsive = typeof size === "string";
  const sizeStyle = isResponsive 
  ? { width: size, height: "100%", aspectRatio: "2/3" } 
  : { width: size, height: size };

  if (showFallback) {
    return (
      <div
        style={{
          ...sizeStyle,
          borderRadius,
          background: showBackground 
            ? `linear-gradient(135deg, ${teamColor}DD, ${teamColor}88)`
            : `linear-gradient(135deg, ${teamColor}22, ${teamColor}11)`,
          border: `3px solid ${teamColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {showBackground && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(circle, ${teamColor}44 1px, transparent 1px)`,
            backgroundSize: '8px 8px',
            opacity: 0.3
          }} />
        )}
        
        <svg
          width={isResponsive ? "40%" : size * 0.5}
          height={isResponsive ? "40%" : size * 0.5}
          viewBox="0 0 24 24"
          fill="none"
          stroke={showBackground ? "#ffffff" : teamColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: 'relative', zIndex: 1 }}
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    );
  }

  return (
    <div
      style={{
        ...sizeStyle,
        borderRadius,
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
        border: `3px solid ${teamColor}`,
        background: showBackground ? `linear-gradient(135deg, ${teamColor}DD, ${teamColor}88)` : T.card
      }}
    >
      {showBackground && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${teamColor}44 1px, transparent 1px)`,
          backgroundSize: '8px 8px',
          opacity: 0.3,
          zIndex: 0
        }} />
      )}
      
      <img
        src={imageUrl}
        alt={player?.name || "Player"}
        onError={() => setImageError(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          position: 'relative',
          zIndex: 1
        }}
      />
    </div>
  );
}

export default PlayerImage;