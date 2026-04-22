export interface SheetInfo {
  id: string;
  name: string;
  photo: string; // Adicionado para bater com o PDF
}

export interface GroupInfo {
  id: string;
  name: string;
  sheets: SheetInfo[];
}

export const CATALOG_STRUCTURE: GroupInfo[] = [
  {
    id: 'engine',
    name: 'ENGINE',
    sheets: [
      { id: 'E01', name: 'AIR CLEANER PARTS', photo: 'AIR CLEANER PARTS.png' },
      { id: 'E02', name: 'AIR HOSE', photo: 'AIR HOSE.png' },
      { id: 'E03', name: 'AIR INTAKE PIPING', photo: 'AIR INTAKE PIPING.png' },
      { id: 'E04', name: 'DRAIN PIPING (ENGINE)', photo: 'DRAIN PIPING (ENGINE).png' },
      { id: 'E05', name: 'ENGINE', photo: 'ENGINE.png' },
      { id: 'E06', name: 'ENGINE OIL FILTER PIPING', photo: 'ENGINE OIL FILTER PIPING.png' },
      { id: 'E07', name: 'ENGINE PARTS', photo: 'ENGINE PARTS.png' },
      { id: 'E08', name: 'EXHAUST PIPING', photo: 'EXHAUST PIPING.png' },
      { id: 'E09', name: 'FAN DRIVE PIPING', photo: 'FAN DRIVE PIPING.png' },
      { id: 'E10', name: 'FUEL COOLER', photo: 'FUEL COOLER.png' },
      { id: 'E11', name: 'FUEL FEED PIPING', photo: 'FUEL FEED PIPING.png' },
      { id: 'E12', name: 'FUEL PIPING (1)', photo: 'FUEL PIPING (1).png' },
      { id: 'E13', name: 'FUEL PIPING (2)', photo: 'FUEL PIPING (2).png' },
      { id: 'E14', name: 'FUEL PIPING (3)', photo: 'FUEL PIPING (3).png' },
      { id: 'E15', name: 'FUEL PIPING (4)', photo: 'FUEL PIPING (4).png' },
      { id: 'E16', name: 'LARGE AIR CLEANER PARTS', photo: 'LARGE AIR CLEANER PARTS.png' },
      { id: 'E17', name: 'OIL COOLER', photo: 'OIL COOLER.png' },
      { id: 'E18', name: 'OIL COOLER PARTS', photo: 'OIL COOLER PARTS.png' },
      { id: 'E19', name: 'RADIATOR', photo: 'RADIATOR.png' },
      { id: 'E20', name: 'RADIATOR PARTS', photo: 'RADIATOR PARTS.png' },
      { id: 'E21', name: 'TRANSMISSION COOLER', photo: 'TRANSMISSION COOLER.png' },
      { id: 'E22', name: 'TRANSMISSION COOLER PIPING', photo: 'TRANSMISSION COOLER PIPING.png' },
    ]
  },
  {
    id: 'frame_cover',
    name: 'FRAME COVER',
    sheets: [
      { id: 'C01', name: 'UNDER COVER', photo: 'UNDER COVER.png' },
      { id: 'C02', name: 'MUFFLER COVER', photo: 'MUFFLER COVER.png' },
      { id: 'C03', name: 'OIL COOLER COVER', photo: 'OIL COOLER COVER.png' },
      { id: 'C04', name: 'RADIATOR COVER', photo: 'RADIATOR COVER.png' },
    ]
  },
  {
    id: 'front_end_attachments',
    name: 'FRONT-END ATTACHMENTS',
    sheets: [
      { id: 'F01', name: 'FRONT PIPING (1)', photo: 'FRONT PIPING (1).png' },
      { id: 'F02', name: 'FRONT PIPING (2)', photo: 'FRONT PIPING (2).png' },
      { id: 'F03', name: 'FRONT PIPING (3)', photo: 'FRONT PIPING (3).png' },
      { id: 'F04', name: 'ARM CYLINDER', photo: 'ARM CYLINDER.png' },
      { id: 'F05', name: 'BE-ARM 3.4m', photo: 'BE-ARM 3.4m.png' },
      { id: 'F06', name: 'BE-BOOM 7.55m', photo: 'BE-BOOM 7.55m.png' },
      { id: 'F07', name: 'BOOM CYLINDER', photo: 'BOOM CYLINDER.png' },
      { id: 'F08', name: 'BUCKET 7.0m3', photo: 'BUCKET 7.0m3.png' },
      { id: 'F09', name: 'BUCKET CYLINDER', photo: 'BUCKET CYLINDER.png' },
    ]
  },
  {
    id: 'hydraulic_piping',
    name: 'HYDRAULIC PIPING',
    sheets: [
      { id: 'HP01', name: 'DELIVERY PIPING (1)', photo: 'DELIVERY PIPING (1).png' },
      { id: 'HP02', name: 'DELIVERY PIPING (2)', photo: 'DELIVERY PIPING (2).png' },
      { id: 'HP03', name: 'DELIVERY PIPING (3)', photo: 'DELIVERY PIPING (3).png' },
      { id: 'HP04', name: 'DELIVERY PIPING (4)', photo: 'DELIVERY PIPING (4).png' },
      { id: 'HP05', name: 'DRAIN PIPING (SENSOR)', photo: 'DRAIN PIPING (WITH CONTAMINATION SENSOR).png' },
      { id: 'HP06', name: 'DRAIN PIPING', photo: 'DRAIN PIPING.png' },
      { id: 'HP07', name: 'MAKEUP PIPING (SWING)', photo: 'MAKEUP PIPING (SWING).png' },
      { id: 'HP08', name: 'RETURN PIPING (1)', photo: 'RETURN PIPING (1).png' },
      { id: 'HP09', name: 'RETURN PIPING (2)', photo: 'RETURN PIPING (2).png' },
      { id: 'HP10', name: 'SUCTION PIPING (1)', photo: 'SUCTION PIPING (1).png' },
      { id: 'HP11', name: 'SUCTION PIPING (2)', photo: 'SUCTION PIPING (2).png' },
    ]
  },
  {
    id: 'hydraulic_piping_main',
    name: 'HYDRAULIC PIPING (MAIN)',
    sheets: [
      { id: 'HPM01', name: 'MAIN PIPING (1-1)', photo: 'MAIN PIPING (1-1).png' },
      { id: 'HPM02', name: 'MAIN PIPING (1-2)', photo: 'MAIN PIPING (1-2).png' },
      { id: 'HPM03', name: 'MAIN PIPING (1-3)', photo: 'MAIN PIPING (1-3).png' },
      { id: 'HPM04', name: 'MAIN PIPING (2)', photo: 'MAIN PIPING (2).png' },
      { id: 'HPM05', name: 'MAIN PIPING (3)', photo: 'MAIN PIPING (3).png' },
      { id: 'HPM06', name: 'MAIN PIPING (4)', photo: 'MAIN PIPING (4).png' },
      { id: 'HPM07', name: 'MAIN PIPING (5)', photo: 'MAIN PIPING (5).png' },
    ]
  },
  {
    id: 'hydraulic_piping_pilot',
    name: 'HYDRAULIC PIPING (PILOT)',
    sheets: [
      { id: 'HPP01', name: 'PILOT PIPING (1)', photo: 'PILOT PIPING (1).png' },
      { id: 'HPP02', name: 'PILOT PIPING (2-1)', photo: 'PILOT PIPING (2-1).png' },
      { id: 'HPP03', name: 'PILOT PIPING (2-2)', photo: 'PILOT PIPING (2-2).png' },
      { id: 'HPP04', name: 'PILOT PIPING (3)', photo: 'PILOT PIPING (3).png' },
      { id: 'HPP05', name: 'PILOT PIPING (4)', photo: 'PILOT PIPING (4).png' },
      { id: 'HPP06', name: 'PILOT PIPING (5)', photo: 'PILOT PIPING (5).png' },
      { id: 'HPP07', name: 'PILOT PIPING (6-1)', photo: 'PILOT PIPING (6-1).png' },
      { id: 'HPP08', name: 'PILOT PIPING (6-2)', photo: 'PILOT PIPING (6-2).png' },
      { id: 'HPP09', name: 'PILOT PIPING (7)', photo: 'PILOT PIPING (7).png' },
      { id: 'HPP10', name: 'PILOT PIPING (8)', photo: 'PILOT PIPING (8).png' },
      { id: 'HPP11', name: 'PILOT PIPING (9)', photo: 'PILOT PIPING (9).png' },
      { id: 'HPP12', name: 'PILOT PIPING (10)', photo: 'PILOT PIPING (10).png' },
      { id: 'HPP13', name: 'PILOT PIPING (11)', photo: 'PILOT PIPING (11).png' },
    ]
  },
  {
    id: 'hydraulic_system',
    name: 'HYDRAULIC SYSTEM',
    sheets: [
      { id: 'HS01', name: 'SWING DEVICE', photo: 'SWING DEVICE.png' },
      { id: 'HS02', name: 'CONTROL VALVE (MAIN)', photo: 'CONTROL VALVE (MAIN).png' },
      { id: 'HS03', name: 'CONTROL VALVE (SWING)', photo: 'CONTROL VALVE (SWING).png' },
      { id: 'HS04', name: 'FAN DRIVE (OIL COOLER)', photo: 'FAN DRIVE (OIL COOLER).png' },
      { id: 'HS05', name: 'FAN DRIVE (RADIATOR)', photo: 'FAN DRIVE (RADIATOR).png' },
      { id: 'HS06', name: 'FUEL FEED PUMP', photo: 'FUEL FEED PUMP.png' },
      { id: 'HS07', name: 'LUBRICATE PIPING (PUMP)', photo: 'LUBRICATE PIPING (PUMP).png' },
      { id: 'HS08', name: 'PUMP DEVICE', photo: 'PUMP DEVICE.png' },
    ]
  },
  {
    id: 'undercarriage',
    name: 'UNDERCARRIAGE',
    sheets: [
      { id: 'U01', name: 'TRAVEL PIPING COVER (SIDE)', photo: 'TRAVEL PIPING COVER (SIDE).png' },
      { id: 'U02', name: 'FRONT IDLER', photo: 'FRONT IDLER.png' },
      { id: 'U03', name: 'LOWER ROLLER', photo: 'LOWER ROLLER.png' },
      { id: 'U04', name: 'TRACK SIDE FRAME (2)', photo: 'TRACK SIDE FRAME (2).png' },
      { id: 'U05', name: 'TRAVEL PIPING (CENTER)', photo: 'TRAVEL PIPING (CENTER).png' },
      { id: 'U06', name: 'TRAVEL PIPING (SIDE)', photo: 'TRAVEL PIPING (SIDE).png' },
      { id: 'U07', name: 'TRAVEL PIPING COVER (CENTER)', photo: 'TRAVEL PIPING COVER (CENTER).png' },
      { id: 'U08', name: 'UPPER ROLLER', photo: 'UPPER ROLLER.png' },
    ]
  }
];
