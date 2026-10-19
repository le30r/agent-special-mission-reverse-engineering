# Original SCC save/load checkpoints and Start handlers

Read-only extraction, CP1251 original SCC, 2026-10-19. These are resource observations, not a runtime replay. Start is re-dispatched on native load; inspect the matching saved State, including explicit remote stateScene.

## Level1.scc:149 — Click 0 Start Stat_v

```text
Click 0 Start Stat_v
{
  Case 1
    Smusic 1 1.mp3
  Break
}
```

## Level1.scc:202 — Click 0 Start Slip

```text
Click 0 Start Slip
{
  Case 1
    Start Slip
  Break
}
```

## Level1.scc:209 — Click 0 Start Lec_v

```text
Click 0 Start Lec_v
{
  Case 2
    Hide Mainhero
    StartW Vniz
    Setxy 235 480
    State Lec_v 1
  Break
}
```

## Level2.scc:223 — Click 0 Start Zmei

```text
Click 0 Start Zmei
{
  Case 1
   Goto 135 440
   StartW Door_Close
   Setxy 135 440
   State Zmei 0
   Cursor Door 2
  Break
}
```

## Level2.scc:234 — Click 0 Start Lora

```text
Click 0 Start Lora
{
  Case 0
   Hide Lora
  Break
  Case 1
   Cursor Door 0
   Cursor Knop 6
   Start Startlevel2
  Break
  Case 3
   Hide Lora
   Cursor Door 2
   Cursor Knop 0
  Break
}
```

## Level2.scc:251 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Objzet Ygol_zd 200
   Objzet Bard_r 138
   Smusic 1 2.mp3
  Break
}
```

## Level2.scc:260 — Click 0 Start Goto_18

```text
Click 0 Start Goto_18
{
  Case 1
    StartW Gotoiz18
    Setxy 640 218
    State Goto_18 0
  Break
}
```

## Level3.scc:270 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 7.mp3
    StartW K_slip
    Setxy 720 575
    State Interface 1
  Break
  Case 1
    Smusic 1 4.mp3
  Break
}
```

## Level3.scc:283 — Click 0 Start Vent

```text
Click 0 Start Vent
{
  Case 0
    Start Ventc
  Break
}
```

## Level3.scc:290 — Click 0 Start Lora

```text
Click 0 Start Lora
{
  Case 4
    Setmsk Masks\Scn_03_no.tif
    Objzet Lora 150
    StartW Lora_c1
    Block
    Goto 805 595
    StartW Talke_lora
    Setxy 805 595
    Ublock
    StartW Lora_out
    State Lora 5
  Break
  Case 5
   Hide Lora
  Break
}
```

## Level3.scc:309 — Click 0 Start Lec_v

```text
Click 0 Start Lec_v
{
  Case 2
    Cursor Lec_v 2
  Break
  Case 3
    Hide Mainhero
    StartW Vniz
    Setxy 130 570
    State Lec_v 2
  Break
  Case 5
    Cursor Lec_v 0
  Break
}
```

## Level3.scc:343 — Click 0 Start Water

```text
Click 0 Start Water
{
  Case 1
    Start Watc
    StartW Lora_s
    Start Lora_c
  Break
}
```

## Level4.scc:67 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 2.mp3
  Break
}
```

## Level5.scc:158 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 2.mp3
  Break
  Case 2
    Smusic 1 2.mp3
    Hide Boy
  Break
}
```

## Level5.scc:169 — Click 0 Start Boy_a

```text
Click 0 Start Boy_a
{
  Case 2
    Block
    Hide Boy
    Hide Mainhero
    Objzet Col_all 5
    Objzet Col_vaz 6
    Objzet Trost 4
    StartW Vniz
    Objzet Col_all 1010
    Objzet Col_vaz 1000
    Objzet Trost 950
    Setxy 465 430
    State Boy_a 1
    Ublock
  Break
}
```

## Level5.scc:188 — Click 0 Start Boy_r

```text
Click 0 Start Boy_r
{
  Case 1
  Case 2
  Case 3
   StartW Boy_sid
  Break
  Case 5
    Hide Boy
    Lstate Boy 1 16
    State Boy 2
  Break
}
```

## Level6.scc:132 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 2.mp3
  Break
}
```

## Level6.scc:139 — Click 0 Start Oxpana

```text
Click 0 Start Oxpana
{
  Case 0
    StartW Oxp_c1
  Break
  Case 1
  Case 2
  Case 3
  Case 4
    StartW Oxp_trost
  Break
}
```

## Level6.scc:152 — Click 0 Start Goto_5

```text
Click 0 Start Goto_5
{
  Case 1
    Block
    StartW Verx
    Setxy 48 450
    Ublock
    State Goto_5 0
  Break
}
```

## Level7.scc:114 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 3.mp3
  Break
}
```

## Level7.scc:121 — Click 0 Start No

```text
Click 0 Start No
{
  Case 1
    Hide No
  Break
}
```

## Level7.scc:128 — Click 0 Start Oxp_no

```text
Click 0 Start Oxp_no
{
  Case 1
    Hide Ohpana
  Break
  Case 2
    Hide Oxp_no
  Break
}
```

## Level7.scc:138 — Click 0 Start To_8

```text
Click 0 Start To_8
{
  Case 2
    Setmsk Masks\Scn_07.tif
  Break
  Case 3
    StartW Gotoiz8
    Setxy 785 435
    State To_8 2
  Break
}
```

## Level7.scc:150 — Click 0 Start Ohpana

```text
Click 0 Start Ohpana
{
  Case 0
    Setmsk Masks\Scn_07_oxp.tif
  Break
  Case 2
    Setmsk Masks\Scn_07.tif
     Hide Ohpana
  Break
}
```

## Level8.scc:180 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 5.mp3
  Break
}
```

## Level8.scc:187 — Click 0 Start Barmensha

```text
Click 0 Start Barmensha
{
  Case 0
    Start Barm_c
  Break
  Case 1
    StartW Barm_1
  Break
}
```

## Level8.scc:197 — Click 0 Start Striptiz

```text
Click 0 Start Striptiz
{
  Case 0
    Start Strip_c
  Break
}
```

## Level8.scc:204 — Click 0 Start Lec_v

```text
Click 0 Start Lec_v
{
  Case 10
    State Lec_v 0
    State To71 0
    Cursor To71 3
    State Barm_click 0
    Cursor Lec_v 2
    Hide Micro
    Cursor Micro 0
    Hide Barm_click
    Cursor Barm_click 0
    Show Gotox_a
    Cursor Gotox_a 3
  Break
}
```

## Level10.scc:189 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 2.mp3
  Break
}
```

## Level10.scc:196 — Click 0 Start Band_a

```text
Click 0 Start Band_a
{
  Case 1
   Setmsk Masks\scn_10_b.tif
   Start K_bandit Fclick Name
   Block
   Goto 700 575
  Break
}
```

## Level10.scc:206 — Click 0 Start Plocat_l_v

```text
Click 0 Start Plocat_l_v
{
  Case 1
  Case 2
    Cursor Plocat_l_v 0
  Break
}
```

## Level10.scc:225 — Click 0 Start Telefon

```text
Click 0 Start Telefon
{
  Case 1
   Hide Boy_ruki
   Start Boyc
  Break
  Case 2
   Start B_rolici
  Break
  Case 3
   Hide Boy_ruki
   Hide Boy_b
   Hide Boy
  Break
}
```

## Level11.scc:84 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 2.mp3
    Objzet D_g_12 500
    Objzet Dv_per 550
  Break
}
```

## Level11.scc:93 — Click 0 Start To_12

```text
Click 0 Start To_12
{
  Case 1
    StartW Gotoiz12
    Setxy 466 540
    Objzet D_g_12 500
    State To_12 0
  Break
}
```

## Level12.scc:134 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
  Case 1
     Start Kuritc
     Smusic 1 2.mp3
  Break
}
```

## Level12.scc:143 — Click 0 Start Statuette

```text
Click 0 Start Statuette
{
  Case 2
  Hide Statuette
  Hide Statuette1
  Break
}
```

## Level12.scc:151 — Click 0 Start Plocat_l_v 10

```text
Click 0 Start Plocat_l_v 10
{
  Case 1
    Cursor Smoker 7
  Break
}
```

## Level13.scc:116 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Objzet Dvep_vx 1000
    Smusic 1 11.mp3
  Break
}
```

## Level13.scc:124 — Click 0 Start Privratnik

```text
Click 0 Start Privratnik
{
  Case 2
    State Flag 6
  Break
  Case 3
  Case 4
    State Flag 6
  Break
  Case 5
  Case 6
    Setmsk Masks\scn_13_2.tif
    Hide Privratnik
  Break
}
```

## Level13.scc:140 — Click 0 Start Goto_14

```text
Click 0 Start Goto_14
{
  Case 2
    StartW Gotoiz14
    Setxy 445 485
    Objzet Dvep_vx 1000
    State Goto_14 1
    State To_14 1
  Break
}
```

## Level13.scc:151 — Click 0 Start To_14

```text
Click 0 Start To_14
{
  Case 2
    StartW Gotoiz14
    Setxy 445 485
    Objzet Dvep_vx 1000
    State Goto_14 1
    State To_14 1
  Break
}
```

## Level14.scc:133 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 11.mp3
  Break
}
```

## Level14.scc:140 — Click 0 Start Officiant

```text
Click 0 Start Officiant
{
  Case 0
   Block
   Goto 400 450
   StartW Offic1
   Ublock
   State Officiant 1
  Break
}
```

## Level14.scc:151 — Click 0 Start Narc_bl

```text
Click 0 Start Narc_bl
{
  Case 1
   Hide  Narcman
   Hide  Narc_bl
   Hide Chainic
  Break
}
```

## Level15.scc:125 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 11.mp3
  Break
}
```

## Level15.scc:132 — Click 0 Start Narcman

```text
Click 0 Start Narcman
{
  Case 1
    StartW K_s_talke
    Start Narc_c
    StartW K_vstaet
    Setxy 437 535
    State Narcman 2
  Break
  Case 2
  Case 3
    Start Narc_c
  Break
  Case 4
  Case 5
  Case 6
  Case 7
  Case 8
    StartW Narc_otb4
  Break
}
```

## Level16.scc:103 — Click 0 Start Boy

```text
Click 0 Start Boy
{
  Case 1
    Setmsk Masks\scn_16_m.tif
    Block
    Goto 585 595
    Goto 580 565
    Ublock
    StartW Boy_a
    Setmsk Masks\scn_16.tif
    Setxy 580 565
    StartW Speak_boy
    Setxy 580 565
    State Boy 0
  Break
}
```

## Level16.scc:120 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Objzet Dv_17 1000
  Break
}
```

## Level17.scc:151 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
  Case 4
     Smusic 1 10.mp3
  Break
}
```

## Level17.scc:159 — Click 0 Start Lec_v

```text
Click 0 Start Lec_v
{
  Case 0
    Cursor Lec_v 1
  Case 3
    Cursor Lec_v 1
  Break
}
```

## Level17.scc:168 — Click 0 Start V1

```text
Click 0 Start V1
{
  Case 1
     Cursor V1 6
  Break
}
```

## Level17.scc:175 — Click 0 Start Smotritel

```text
Click 0 Start Smotritel
{
  Case 0
     Block
     Setmsk Masks\scn_17_no.tif
     Setxy 45 385
     StartW Looker_canai
     Goto 30 395
     StartW Gotov16
     Ublock
     Level 16 1
  Break
  Case 1
  Case 2
    Start Looker_c
  Break
  Case 3
    Hide Smotritel
    State Smotritel 4
  Break
}
```

## Level18.scc:119 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0

  Break
  Case 3
    Start Startlevel
  Break
}
```

## Level18.scc:129 — Click 0 Start Lamp

```text
Click 0 Start Lamp
{
  Case 1
    Show Lamp
    Cursor Lamp 6
    Cursor Lampochka 6
  Break
}
```

## Level18.scc:138 — Click 0 Start To_20

```text
Click 0 Start To_20
{
  Case 1
     StartW Gotoiz20
     Setxy 149 390
     State To_20 0
  Break
}
```

## Level18.scc:147 — Click 0 Start Boy

```text
Click 0 Start Boy
{
  Case 1
  Case 2
     Setmsk Masks\Scn_18boy.tif
     Start Boyc
  Break
  Case 3
     Setmsk Masks\Scn_18.tif
     Hide Boy
  Break
}
```

## Level19.scc:184 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 5.mp3
  Break
}
```

## Level19.scc:191 — Click 0 Start Manecen

```text
Click 0 Start Manecen
{
  Case 1
    Setmsk Masks\Scn_19_2.tif
    Start Startlevel1
    Start Manecenc
    StartW Speak_band
    State Goto_27 3
    State Manecen 2
  Break
  Case 2
    Setmsk Masks\Scn_19_2.tif
    Start Startlevel1
    Start Manecenc
    State Goto_27 3
  Break
  Case 3
    Setmsk Masks\Scn_19_2.tif
    Start Manecenc
  Break
  Case 4
    Start Startlevel
    State Goto_27 0
    Stop Manecenc
    Hide Avto
    Hide Avto1
    Hide Manecen
    Hide Baby
    Hide Pop2
    Hide Popu
    Hide Avto_ten
    Hide Manecenc1
  Break
}
```

## Level19.scc:226 — Click 0 Start Popugai

```text
Click 0 Start Popugai
{
  Case 1
    Cursor Bomsh 6
    State Popugai 2
  Break
}
```

## Level19.scc:234 — Click 0 Start Bomsh

```text
Click 0 Start Bomsh
{
  Case 0
  Case 1
    Start Bomshc
  Break
  Case 2
    Start B_popugai
  Break
  Case 3
    Start Bomsh_talke
  Break
  Case 4
    Hide Bomsh
    Hide Meshoc
    Hide Bom_botl
  Break
}
```

## Level20.scc:80 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 2.mp3
  Break
}
```

## Level21.scc:187 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 2.mp3
  Break
}
```

## Level21.scc:194 — Click 0 Start Grandmother

```text
Click 0 Start Grandmother
{
  Case 0
    Start Grandmc
  Break
  Case 1
    Hide Grandmother
  Break
}
```

## Level21.scc:204 — Click 0 Start Balerin

```text
Click 0 Start Balerin
{
  Case 1
    Goto 300 520
    StartW Red
    StartW K_talk
    Setxy 300 520
    Lstate Babka 4 23
    State Balerin 2
  Break
}
```

## Level22.scc:175 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 9.mp3
  Break
}
```

## Level22.scc:200 — Click 0 Start Lamp

```text
Click 0 Start Lamp
{
  Case 0

  Break
  Case 1
   Setbck BACKGRD\Scn_22.tif
   Setmsk Masks\Scn_22.tif
  Break
}
```

## Level22.scc:211 — Click 0 Start Ruba

```text
Click 0 Start Ruba
{
  Case 0
    Start Ruba_c
  Break
  Case 1
    StartW Ruba_off1
  Break
}
```

## Level22.scc:221 — Click 0 Start To_21

```text
Click 0 Start To_21
{
  Case 1
    StartW Gotoiz21_t
    Setxy 845 500
    State To_21 0
    Lstate Goto_22 2 21
    Lstate Lamp 1 18
    Lstate Lampochka 1 18
  Break
  Case 2
    StartW Gotoiz21
    Setxy 845 500
    State To_21 0
  Break
}
```

## Level23.scc:216 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 10.mp3
  Break
}
```

## Level23.scc:223 — Click 0 Start Babka

```text
Click 0 Start Babka
{
  Case 0
    StartW K_tea
    Start Babka_tea
    Hide Main_ruki
    Hide Main_ruki1
    State Babka 1
    Block
  Break
  Case 1
  Case 2
  Case 3
    Start Babka_tea
  Break
  Case 4
    Objzet Babka 70
    Cursor Babka 7
    Stop Babka_tea
    Cursor Babka_spina 7
    Cursor Camod 0
    Hide Camod
    Hide Zerc_celoe
    Show Razb_zercalo
    Show R_Z
    Cursor R_Z 5
    Hide Bab_spina
    Setbck BACKGRD\Scn_23_1.tif
    Setmsk Masks\scn_23_no.tif
    Start Babka_gorec
  Break
  Case 5
    Setbck BACKGRD\Scn_23_1.tif
    Setmsk Masks\scn_23_no.tif
    Stop Babka_tea
    Show Razb_zercalo
    Show R_Z
    Hide Bab_spina
    remStartW Babka_talke_1
    Start Babka_gorec
  Break
  Case 6
    Setbck BACKGRD\Scn_23_1.tif
    Setmsk Masks\scn_23_no.tif
    Stop Babka_tea
    Hide Bab_spina
    Start Babka_g1
    Stop Babka_g1
  Break
  Case 7
    State Star 1
    State Stol 3
    Show Zerc_celoe
    Show Camod
    Cursor Camod 5
    Hide Zercalo
    Hide Razb_zercalo
    Hide R_Z
    Hide Zercalo
    State R_Z 1
    Hide Babka
    Start Babka_tea
    Cursor Razb_zercalo 0
    Cursor Bab_spina 7
    Cursor Babka 0
  Break
  Case 10
    Show Zerc_celoe
    Show Camod
    Hide R_Z
    Cursor R_Z 0
    Hide Zercalo
    Hide Razb_zercalo
    Cursor Razb_zercalo 0
    Cursor Zerc_celoe 5
    Hide Zercalo
    Hide Babka
    Hide Bab_spina
  Break
}
```

## Level24.scc:96 — Click 0 Start Ocno

```text
Click 0 Start Ocno
{
  Case 0
    Objzet Stena 130
    StartW K_enter
    Setxy 270 410
    State Ocno 1
  Break
  Case 1
    Objzet Stena 130
    StartW K_enter1
    Setxy 270 410
  Break
}
```

## Level24.scc:111 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 10.mp3
  Break
}
```

## Level24.scc:118 — Click 0 Start Cosa

```text
Click 0 Start Cosa
{
  Case 1
   Cursor Cosa 6
  Break
}
```

## Level24.scc:125 — Click 0 Start Ball

```text
Click 0 Start Ball
{
  Case 0
    Setmsk Masks\Scn_24_m.tif
  Break
  Case 1
    Setmsk Masks\Scn_24_sh.tif
    Hide Ball
  Break
  Case 2
    Hide Shlapa
  Break
}
```

## Level25.scc:144 — Click 0 Start Goto_19

```text
Click 0 Start Goto_19
{
  Case 1
   StartW Gotoiz19
   Setxy 245 585
   State Goto_19 0
  Break
}
```

## Level25.scc:153 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 4.mp3
  Break
}
```

## Level25.scc:160 — Click 0 Start Bomsh

```text
Click 0 Start Bomsh
{
  Case 1
  Case 2
   Start B1
  Break
  Case 3
    StatrW Bom_bez_shl
  Break
  Case 5
   Setbck BACKGRD\Scn_25_n.tif
   Hide Bomsh
   Hide Bom1
   Hide Bom_nar
  Break
}
```

## Level26.scc:23 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 2.mp3
    Lstate Manecen 4 19
    Lstate Goto_27 0 19
    Lstate Petla 1 22
  Break
}
```

## Level27.scc:117 — Click 0 Start Most

```text
Click 0 Start Most
{
  Case 1
    Start Startlevel1
  Break
}
```

## Level27.scc:139 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 9.mp3
  Break
}
```

## Level27.scc:146 — Click 0 Start Sea_left

```text
Click 0 Start Sea_left
{
  Case 0
    Start Anim_more1
    Start Anim_more2
    Start Anim_more3
  Break
}
```

## Level27.scc:156 — Click 0 Start Bandit_1

```text
Click 0 Start Bandit_1
{
  Case 1
   Cursor Gotoxy 3
   Setmsk Masks\Scn_27_2.tif
   Start Ban1_c
   Start Ban2_c
   StartW Gotoiz19
   Setxy 1411 580
  Break
  Case 2
   Setmsk Masks\Scn_27_2.tif
   Start Ban12_1
  Break
  Case 3
   Setmsk Masks\Scn_27_1.tif
  Break
}
```

## Level28.scc:56 — Click 0 Start Dosca

```text
Click 0 Start Dosca
{
  Case 0
    Start Startlevel1
    Show To_19
    Show Doscaa
  Break
  Case 1
    Start Startlevel
    Hide Doscaa
    Show To_19
    Show Door_a
    Show Door
    Cursor Door 3
    Show To_49
    Cursor To_49 3
  Break
}
```

## Level28.scc:89 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 9.mp3
  Break
}
```

## Level28.scc:96 — Click 0 Start Anim_more

```text
Click 0 Start Anim_more
{
  Case 0
    Start More_c
  Break
}
```

## Level28.scc:103 — Click 0 Start Doscaa

```text
Click 0 Start Doscaa
{
  Case 1
  Case 3
   Setmsk Masks\Scn_28.tif
  Break
}
```

## Level28.scc:111 — Click 0 Start Door_a

```text
Click 0 Start Door_a
{
  Case 3
   State Doscaa 3
   Smusic 1 25.mp3
  Break
}
```

## Level29.scc:94 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 2.mp3
  Break
}
```

## Level29.scc:102 — Click 0 Start Janitor

```text
Click 0 Start Janitor
{
  Case 0
   Setmsk Masks\scn_29_1.tif
   Start Janitorc
   Start Waterc
  Break
  Case 1
  Case 5
   Hide Janitor
   Hide Shlang
   Hide Shlang1
   Hide Waterc
   Hide Water_cikl
   Objzet Col_shlang 500
  Break
}
```

## Level30.scc:134 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 8.mp3
  Break
}
```

## Level30.scc:141 — Click 0 Start Pm

```text
Click 0 Start Pm
{
  Case 1
    Show Stoica_a
  Break
  Case 2
  Case 3
    Start PM_pish
  Break
  Case 4
    Hide Pm
  Break
}
```

## Level31.scc:93 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 8.mp3
  Break
}
```

## Level31.scc:100 — Click 0 Start Dog2

```text
Click 0 Start Dog2
{
  Case 1
   Setmsk Masks\Scn_31_c.tif
  Break
  Case 2
   Start Dog2_c
  Break
  Case 3
    Setmsk Masks\Scn_31m.tif
    Hide dog2
  Break
}
```

## Level31.scc:114 — Click 0 Start Dog1

```text
Click 0 Start Dog1
{
  Case 1
   Setmsk Masks\Scn_31_c2.tif
  Break
  Case 2
   Start Dog1_c
  Break
  Case 3
    Setmsk Masks\Scn_31m.tif
    Hide dog1
    Hide dog2
  Break
}
```

## Level32.scc:128 — Click 0 Start Molot

```text
Click 0 Start Molot
{
  Case 0
    Setxy 355 430
    StartW Speak_t
    Setxy 355 430
    State Molot 1
    Cursor Chainik 6
  Break
}
```

## Level32.scc:140 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 8.mp3
   Setxy 350 430
  Break
}
```

## Level32.scc:148 — Click 0 Start Gravman

```text
Click 0 Start Gravman
{
  Case 1
    Setxy 355 430
    StartW Grav_divan
    Cursor Grob 6
    State Gravman 2
    State Flag 1
  Break
  Case 4
    Hide Gravman
  Break
}
```

## Level33.scc:151 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 8.mp3
  Break
}
```

## Level33.scc:158 — Click 0 Start Cherep

```text
Click 0 Start Cherep
{
  Case 1
    Cursor Cherep 6
  Break
}
```

## Level33.scc:165 — Click 0 Start Lopata

```text
Click 0 Start Lopata
{
  Case 1
    Show Lopata_a
    Show Plita_a
    Show Plita2
    Show Plita3
    Cursor Lopata 6
    State Lopata_a 1
  Break
}
```

## Level33.scc:177 — Click 0 Start Babka 23

```text
Click 0 Start Babka 23
{
  Case 6
  Case 7
    Cursor Vnutr 6
    Start Hrap1
  Break
}
```

## Level33.scc:186 — Click 0 Start Gravmana

```text
Click 0 Start Gravmana
{
  Case 1
  Case 2
    Hide Gravman
    Hide Gravman1
  Break
}
```

## Level34.scc:134 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 empty.mp3
  Break
}
```

## Level34.scc:141 — Click 0 Start Knopka

```text
Click 0 Start Knopka
{
  Case 6
    Cursor Knopka 0
  Break
}
```

## Level34.scc:148 — Click 0 Start To_48

```text
Click 0 Start To_48
{
  Case 6
    Cursor To_48 0
  Break
}
```

## Level34.scc:155 — Click 0 Start To_8

```text
Click 0 Start To_8
{
  Case 2
    StartW Gotoiz8
    Setxy 724 544
    StartW Door_close
    Hide Rub_on
    State To_8 0
    Objzet Rub_off 1400
    Objzet Rub_on 1450
  Break
}
```

## Level34.scc:168 — Click 0 Start To_35

```text
Click 0 Start To_35
{
  Case 1

    StartW Gotoiz35
    Setxy 90 544
    State To_35 0
  Break
}
```

## Level35.scc:133 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
     Smusic 1 1.mp3
  Break
}
```

## Level35.scc:140 — Click 0 Start Baby

```text
Click 0 Start Baby
{
  Case 0
  Case 1
   Start Baby_c
  Break
  Case 2
   State r1 1
   Hide Baby
   StartW Speak_o
   Setxy 775 450
   Setmsk Masks\Scn_35.tif
   Cursor r1 6
   Cursor r2 6
   Cursor r3 6
   Cursor r4 6
   Cursor Svet 6
   State Baby 3
  Break
  Case 3
   Setmsk Masks\Scn_35.tif
  Break

}
```

## Level36.scc:166 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
     Smusic 1 12.mp3
 Break
}
```

## Level36.scc:173 — Click 0 Start Conteiner

```text
Click 0 Start Conteiner
{
  Case 1
  Case 2
   Setmsk Masks\Scn_36_1c.tif
 Break
}
```

## Level36.scc:181 — Click 0 Start Cluca

```text
Click 0 Start Cluca
{
  Case 1
   Setmsk Masks\Scn_36_no1.tif
 Break
}
```

## Level36.scc:188 — Click 0 Start Fire

```text
Click 0 Start Fire
{
  Case 0
    Start Fire_Start
  Break
}
```

## Level37.scc:137 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
   Smusic 1 2.mp3
  Break
  Case 1
   Smusic 1 2.mp3
    Start Startlevel
  Break
}
```

## Level37.scc:157 — Click 0 Start Lec_v

```text
Click 0 Start Lec_v
{
  Case 1
    StartW Vniz
    Setxy 255 453
    State Lec_v 0
  Break
}
```

## Level37.scc:181 — Click 0 Start Soldat

```text
Click 0 Start Soldat
{
  Case 1
    Setmsk Masks\Scn_37_s.tif
    Start Startlevel1
    Start Maior_c
    Start Beshl_c
    Start Beshr_c
  Break
  Case 3
    Hide Soldat
    Hide Soldat1
    Hide Beshr_c
    Hide Soldat123
    Hide Soldat2
    Hide Soldat3
    Hide Soldat45
    Hide Per_besh
    Hide Poc1
    Hide Poc2
    Hide Poc3
  Break
}
```

## Level38.scc:269 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 1.mp3
  Break
}
```

## Level38.scc:276 — Click 0 Start Lamp_t

```text
Click 0 Start Lamp_t
{
  Case 0
    Start Lampa
  Break
  Case 1
    Start Lampa1
  Break
}
```

## Level38.scc:297 — Click 0 Start Lampochka 44

```text
Click 0 Start Lampochka 44
{
  Case 1
  Case 2
    Setmsk Masks\Scn_38.tif
  Break
}
```

## Level38.scc:305 — Click 0 Start Lapm 44

```text
Click 0 Start Lapm 44
{
  Case 1
  Case 2
    Setmsk Masks\Scn_38.tif
  Break
}
```

## Level38.scc:313 — Click 0 Start Pank

```text
Click 0 Start Pank
{
  Case 0
    Setmsk Masks\Scn_38_no.tif
    Start Bandit1_c
    Block
    Start Bandit2_Lora Fclick Bandit
  Break
  Case 1
    Setmsk Masks\Scn_38_no.tif
    Start Bandit1_c
    Start Bandit2_c
  Break
  Case 2
    Setmsk Masks\Scn_38.tif
  Break
}
```

## Level38.scc:331 — Click 0 Start Goto_1

```text
Click 0 Start Goto_1
{
  Case 1
   Cursor Goto_1 1
   Cursor Col_left 1
  Break
}
```

## Level38.scc:339 — Click 0 Start Goto_44

```text
Click 0 Start Goto_44
{
  Case 1
    StartW Gotoiz44
    Setxy 640 218
    State Goto_44 0
  Break
}
```

## Level39.scc:98 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 1.mp3
  Break
}
```

## Level39.scc:105 — Click 0 Start Fly

```text
Click 0 Start Fly
{
  Case 0
    Start Fly_c
  Break
}
```

## Level39.scc:112 — Click 0 Start Goto_40

```text
Click 0 Start Goto_40
{
  Case 1
    Hide Mainhero
    Objzet Col_all 5
    Objzet Col_vaz 6
    StartW Vniz
    Objzet Col_all 1010
    Objzet Col_vaz 1000
    Setxy 465 430
    State Goto_40 0
  Break
}
```

## Level40.scc:67 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 1.mp3
    StartW Verx
    Setxy 48 450
  Break
}
```

## Level41.scc:109 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 1.mp3
  Break
}
```

## Level42.scc:39 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 1.mp3

  Break
}
```

## Level43.scc:38 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 1.mp3

  Break
}
```

## Level44.scc:83 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 1.mp3
    Setmsk Masks\Scn_44_t.tif
  Break
  Case 1
    Smusic 1 1.mp3
  Break
}
```

## Level44.scc:94 — Click 0 Start To_38

```text
Click 0 Start To_38
{
  Case 1
   Hide Trup
  Break
}
```

## Level44.scc:101 — Click 0 Start To_45

```text
Click 0 Start To_45
{
  Case 1
    StartW Gotoiz45
    Setxy 149 390
    State To_45 0
  Break
}
```

## Level44.scc:110 — Click 0 Start Lamp

```text
Click 0 Start Lamp
{
  Case 1
    Show Lamp
    Cursor Lamp 6
    Cursor Lampochka 6
  Break
}
```

## Level45.scc:55 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Setzon 1
    Smusic 1 1.mp3
  Break
}
```

## Level46.scc:43 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 1.mp3
    Setzon 5
  Break
}
```

## Level47.scc:59 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
    Setzon 0
    Smusic 1 1.mp3
  Break
}
```

## Level48.scc:25 — Click 0 Start Interface

```text
Click 0 Start Interface
{
  Case 0
     Lstate Manecen 1 19
     Lstate Bomsh 4 19
     Lstate Bomsh 1 25
     State Interface 1
  Break
}
```
