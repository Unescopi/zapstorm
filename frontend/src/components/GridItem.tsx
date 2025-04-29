import { ReactNode } from 'react';
import { Box, SxProps, Theme } from '@mui/material';

interface GridItemProps {
  children: ReactNode;
  xs?: number | boolean;
  sm?: number | boolean;
  md?: number | boolean;
  lg?: number | boolean;
  xl?: number | boolean;
  sx?: SxProps<Theme>;
}

/**
 * Componente compatível com Grid item do Material UI 
 * que evita os erros de tipagem da versão atual
 */
export default function GridItem({ 
  children, 
  xs, 
  sm, 
  md, 
  lg, 
  xl, 
  sx = {} 
}: GridItemProps) {
  return (
    <Box
      sx={{
        flexGrow: 0,
        width: {
          xs: xs === true ? '100%' : xs ? `${(xs / 12) * 100}%` : 'auto',
          sm: sm === true ? '100%' : sm ? `${(sm / 12) * 100}%` : undefined,
          md: md === true ? '100%' : md ? `${(md / 12) * 100}%` : undefined,
          lg: lg === true ? '100%' : lg ? `${(lg / 12) * 100}%` : undefined,
          xl: xl === true ? '100%' : xl ? `${(xl / 12) * 100}%` : undefined,
        },
        ...sx
      }}
    >
      {children}
    </Box>
  );
} 