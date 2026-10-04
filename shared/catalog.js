// Starting catalog recovered from the earlier Valence base. Commercial values are demo data.
export const categories = ['Solvents', 'Fine Chemicals', 'Polymer Additives', 'Specialty Reagents'];
const rows = [
  ['Acetone','67-64-1','Solvents','Industrial',99.5,'C3H6O','A versatile solvent for coatings, cleaning and industrial processing.',480],
  ['Isopropyl Alcohol','67-63-0','Solvents','Industrial',99.9,'C3H8O','High-purity IPA for precision cleaning and solvent formulations.',520],
  ['Ethyl Acetate','141-78-6','Solvents','Technical',99.5,'C4H8O2','An ester solvent for inks, coatings and adhesive applications.',540],
  ['Toluene','108-88-3','Solvents','Industrial',99.5,'C7H8','Aromatic solvent for controlled industrial processing.',560],
  ['Citric Acid','77-92-9','Fine Chemicals','Technical',99.5,'C6H8O7','Anhydrous citric acid for industrial formulation and pH adjustment.',68],
  ['Sodium Benzoate','532-32-1','Fine Chemicals','Technical',99,'C7H5NaO2','Technical-grade sodium benzoate for formulation applications.',74],
  ['Benzoic Acid','65-85-0','Fine Chemicals','Technical',99,'C7H6O2','A chemical intermediate for resins and other industrial formulations.',82],
  ['Antioxidant 1010','6683-19-8','Polymer Additives','Polymer',98,'C73H108O12','A hindered phenolic antioxidant for polymer stabilization.',190],
  ['Antioxidant 168','31570-04-4','Polymer Additives','Polymer',98,'C42H63O3P','A phosphite processing stabilizer for polymer applications.',175],
  ['Benzotriazole','95-14-7','Specialty Reagents','Technical',99,'C6H5N3','A specialty intermediate for corrosion-inhibitor formulations.',130],
  ['EDTA Disodium Salt','139-33-3','Specialty Reagents','Reagent',99,'C10H14N2Na2O8','Anhydrous disodium EDTA for chelation and formulation.',115],
  ['Sodium Metabisulfite','7681-57-4','Specialty Reagents','Technical',97,'Na2S2O5','A reducing agent for controlled industrial treatment applications.',48],
];
export const seedProducts = rows.map(([name,casNumber,category,grade,purityPercentage,formula,description,price],i)=>{
  const liquid=category==='Solvents';
  const slug=name.toLowerCase().replaceAll(' ','-');
  return {id:slug,slug,name,casNumber,category,grade,purityPercentage,formula,description,phase:liquid?'Liquid':'Solid',
    hazardClass:'Refer to the approved supplier SDS for this grade and destination.',
    packagingOptions:liquid?[
      {type:'drum',label:'200 L Drum',amount:200,unit:'L',priceCents:price*100,stockUnits:24},
      {type:'ibc',label:'1,000 L IBC tote',amount:1000,unit:'L',priceCents:Math.round(price*4.5)*100,stockUnits:8},
      {type:'bulk',label:'20,000 L Bulk tanker',amount:20000,unit:'L',priceCents:Math.round(price*82)*100,stockUnits:2},
    ]:[
      {type:'bag',label:'25 kg Bag',amount:25,unit:'kg',priceCents:price*100,stockUnits:120},
      {type:'drum',label:'200 kg Fibre drum',amount:200,unit:'kg',priceCents:Math.round(price*7.4)*100,stockUnits:16},
      {type:'bulk-bag',label:'1,000 kg Bulk bag',amount:1000,unit:'kg',priceCents:Math.round(price*34)*100,stockUnits:4},
    ],stockStatus:i===2?'low-stock':i===9?'made-to-order':'in-stock',featured:i<4,
    leadTimeDays:i===9?14:3,discountTiers:[{minimum:4000,percent:5},{minimum:12000,percent:8}],
    imageUrl:'',sdsUrl:'',coaUrl:'',approved:false,archived:false,createdAt:'2026-09-05T00:00:00.000Z',updatedAt:'2026-09-05T00:00:00.000Z'};
});

export function estimate(product, packagingType, quantity) {
  const pack=product.packagingOptions.find(p=>p.type===packagingType);
  if(!pack || !Number.isInteger(quantity) || quantity<1 || quantity>10000) throw new Error('Choose a valid packaging option and quantity.');
  const amount=pack.amount*quantity;
  const discountPercent=Math.max(0,...product.discountTiers.filter(t=>amount>=t.minimum).map(t=>t.percent));
  const subtotalCents=pack.priceCents*quantity;
  const discountCents=Math.round(subtotalCents*discountPercent/100);
  const freightCents=amount>=12000?85000:amount>=4000?32500:9500;
  return {amount,unit:pack.unit,quantity,pack,subtotalCents,discountPercent,discountCents,freightCents,
    freightTier:amount>=12000?'Dedicated freight':amount>=4000?'Consolidated freight':'Pallet freight',
    leadTimeDays:Math.max(product.leadTimeDays,amount>=12000?10:amount>=4000?5:3),totalCents:subtotalCents-discountCents+freightCents};
}
