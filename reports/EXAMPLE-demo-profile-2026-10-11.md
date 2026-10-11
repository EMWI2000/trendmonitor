# Stil- og positioneringsanalyse pr. 2026-10-11

Referencebrand: Baum und Pferdgarten. 6 brands, taksonomi v0.1. Tal bygger på det seneste snapshot og tags; andele er af taggede produkter, så brands med lav tagget andel skal læses med forbehold.

Afsnit 1 er hårde data (udbuddet). Afsnit 2 er en udledning af, hvilken kunde udbuddet og sproget henvender sig til; det er produktets perspektiv, ikke demografi. Demografi kræver B&P's egne kundedata (Shopify-kunderapporter, Meta Audience Insights, nyhedsbrevsdata) og kan kobles på senere.

## 1. Udbud og positionering

| Brand | Live styles | Tagget | Median pris (DKK) | Kjole median | Prisindeks | Prisbånd <1.000 / 1–2k / 2–3k / 3k+ | Størrelser | Nyt ≤ 8 uger | Nedsat | Print-andel | Farve-andel |
|---|---:|---:|---:|---:|---:|---|---|---:|---:|---:|---:|
| Baum und Pferdgarten (self) | 92 | 100 % | 1.299 | 1.799 | 1.00 | 3 % / 80 % / 16 % / 0 % | alfa XS–XL | 18 % | 10 % | 74 % | 59 % |
| Ganni | 113 | 100 % | 1.299 | 1.799 | 1.00 | 4 % / 80 % / 16 % / 0 % | alfa XS–XL | 15 % | 13 % | 67 % | 58 % |
| Gestuz | 103 | 100 % | 1.299 | 1.799 | 1.00 | 1 % / 88 % / 11 % / 0 % | alfa XS–XL | 14 % | 13 % | 56 % | 58 % |
| Munthe | 101 | 100 % | 1.299 | 1.799 | 1.00 | 3 % / 83 % / 14 % / 0 % | alfa XS–XL | 23 % | 11 % | 65 % | 58 % |
| Rotate Birger Christensen | 86 | 100 % | 1.299 | 1.799 | 1.00 | 2 % / 87 % / 10 % / 0 % | alfa XS–XL | 21 % | 12 % | 66 % | 62 % |
| Stine Goya | 124 | 100 % | 1.299 | 1.799 | 1.00 | 5 % / 80 % / 15 % / 0 % | alfa XS–XL | 20 % | 12 % | 65 % | 68 % |

Alle priser er omregnet til DKK med faste kurser fra sources.yaml. Prisindeks = brandets medianpris / referencebrandets medianpris. Print-andel = andel af taggede produkter, der ikke er ensfarvede. Farve-andel = andel uden for neutralerne sort, hvid, grå, brun, navy.

## 1b. Stilafstand til referencebrandet

| Brand | Stilafstand (vægtet JS) | Overlap i (kategori × print × farve) | Kategori | Print | Farve | Silhuet | Materiale |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ganni | 0.10 | 24 % | 0.06 | 0.09 | 0.15 | 0.09 | 0.12 |
| Rotate Birger Christensen | 0.12 | 19 % | 0.10 | 0.11 | 0.13 | 0.12 | 0.21 |
| Munthe | 0.13 | 25 % | 0.06 | 0.16 | 0.14 | 0.10 | 0.19 |
| Stine Goya | 0.15 | 26 % | 0.09 | 0.15 | 0.15 | 0.15 | 0.16 |
| Gestuz | 0.16 | 23 % | 0.15 | 0.18 | 0.21 | 0.14 | 0.17 |

Jensen–Shannon-afstand mellem 0 (identisk mix) og 1 (intet fælles), vægtet med kategori og print dobbelt, farve 1,5, silhuet og materiale 1, resten 0,5. Overlap = andel af brandets (kategori, print, farve)-celler, som også findes hos referencebrandet. Lav afstand og højt overlap er de brands, kunden reelt vælger imellem på hylden; det er dem, udsolgt-indekset skal vægtes mod.

## 1c. Mix pr. attribut (top 3)

| Brand | category | print | colour_family | silhouette | material | length |
|---|---|---|---|---|---|---|
| Baum und Pferdgarten | trousers 21 %, skirt 18 %, top 16 % | solid 26 %, stripe 15 %, floral 14 % | white 15 %, yellow 13 %, pink 13 % | fitted 36 %, oversized 24 %, wide-leg 16 % | viscose 17 %, satin 14 %, knitwear 13 % | midi 41 %, maxi 22 %, mini 19 % |
| Ganni | trousers 19 %, dress 19 %, skirt 18 % | solid 33 %, stripe 17 %, animal 12 % | navy 13 %, red 12 %, brown 12 % | oversized 31 %, fitted 29 %, pleated 15 % | knitwear 14 %, viscose 12 %, satin 12 % | mini 32 %, maxi 25 %, midi 25 % |
| Gestuz | dress 23 %, knit 21 %, skirt 17 % | solid 44 %, stripe 15 %, animal 11 % | blue 18 %, purple 13 %, brown 12 % | oversized 38 %, fitted 27 %, pleated 13 % | knitwear 21 %, wool 14 %, cotton 13 % | midi 44 %, maxi 23 %, mini 21 % |
| Munthe | trousers 20 %, dress 18 %, knit 17 % | solid 35 %, check 17 %, dot 15 % | navy 14 %, white 13 %, blue 12 % | fitted 45 %, oversized 20 %, wide-leg 16 % | knitwear 17 %, cotton 16 %, silk 12 % | mini 34 %, midi 34 %, cropped 21 % |
| Rotate Birger Christensen | top 20 %, trousers 19 %, dress 19 % | solid 34 %, floral 15 %, check 14 % | red 15 %, navy 14 %, blue 10 % | oversized 33 %, fitted 31 %, pleated 15 % | knitwear 17 %, cotton 14 %, linen 14 % | midi 30 %, cropped 27 %, mini 27 % |
| Stine Goya | knit 20 %, trousers 18 %, skirt 18 % | solid 35 %, check 16 %, abstract 11 % | yellow 17 %, red 16 %, pink 14 % | oversized 39 %, fitted 27 %, wide-leg 15 % | knitwear 20 %, silk 13 %, polyester 12 % | mini 42 %, midi 33 %, cropped 19 % |

## 2. Udledt kunde (produktets perspektiv)

| Brand | Anledning i tekster: fest / arbejde / hverdag / ferie | Stemme i tekster: legende / feminin / minimal / bæredygtig / craft | Prisbånd | Størrelsesspænd | Sæsonkoder i tags |
|---|---|---|---|---|---|
| Baum und Pferdgarten | 100 % / 16 % / 100 % / 0 % | 10 % / 0 % / 0 % / 10 % / 0 % | contemporary | alfa XS–XL | – |
| Ganni | 100 % / 17 % / 100 % / 0 % | 13 % / 0 % / 0 % / 10 % / 0 % | contemporary | alfa XS–XL | – |
| Gestuz | 100 % / 12 % / 100 % / 0 % | 16 % / 0 % / 0 % / 11 % / 0 % | contemporary | alfa XS–XL | – |
| Munthe | 100 % / 15 % / 100 % / 0 % | 21 % / 0 % / 0 % / 15 % / 0 % | contemporary | alfa XS–XL | – |
| Rotate Birger Christensen | 100 % / 12 % / 100 % / 0 % | 17 % / 0 % / 0 % / 8 % / 0 % | contemporary | alfa XS–XL | – |
| Stine Goya | 100 % / 15 % / 100 % / 0 % | 10 % / 0 % / 0 % / 14 % / 0 % | contemporary | alfa XS–XL | – |

Ordandele = andel af produkttekster, der nævner mindst ét ord fra lexikonet (se profile.py). Prisbånd efter medianpris i DKK: high street < 800, contemporary < 2.500, premium < 6.000, ellers luxury; tjek valuta.

Sæt ANTHROPIC_API_KEY for at tilføje en Claude-læsning af udbuddets sprog (aldersbånd, livsfase, stilidentitet, forskel fra referencen) pr. brand.
