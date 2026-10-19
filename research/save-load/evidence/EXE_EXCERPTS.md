# Native Save/Load evidence excerpts

The companion [SELECTOR_EXCERPT.md](SELECTOR_EXCERPT.md) projects the conditional-include parser to explain the two serialized selector scalars. All other core Save/Load raw records are in `native-evidence.json`.

Static Agent.exe, SHA-256 `71065c571a9cd40f460458d766720c0a01954e0bef521aad675b4ea6b3186e85`; REA / Ghidra 12.1.4, profile `4f6212bfe31448a7b96743a449e91c35890105cedd34e1d9951e9467d284e0a5`.

Addresses are VA. Functions are decompiler pseudocode, not original source. Lost varargs and parameters are resolved by the assembly excerpts. No Windows process was run.

The adjacent `native-evidence.json` retains full REA envelopes. Repeated selectors and explicitly failed procedure lookups are preserved as tool limitations, not evidence of behavior.

## 0x40c7c4 (selector 0x40c7c4)

REA `ev_811b6cd793aa55c25369d67fd69884a8801e1365b488adf59c157e4f03e2a518`, batch1.

```c
undefined4 __cdecl FUN_0040c7c4(int *param_1)

{
  int *piVar1;
  undefined4 uVar2;
  undefined4 *puVar3;
  int iVar4;
  CHAR local_104 [256];

  FUN_0040aebc();
  FUN_0043a0ec(local_104,(byte *)s_slot_d_sav_004459c3);
  piVar1 = FUN_00438bb4(local_104,&DAT_004459c0);
  if (piVar1 == (int *)0x0) {
    uVar2 = 0xffffffff;
  }
  else {
    if (DAT_004686b0 != (int *)0x0) {
      FUN_004089cc((int)DAT_004686b0);
    }
    FUN_00438f04(piVar1,0x50,0);
    FUN_0040ebb4(DAT_00468518,piVar1);
    FUN_0040d250((int)param_1,piVar1);
    FUN_00438e28((char *)&DAT_0046851c,4,1,piVar1);
    puVar3 = &DAT_00468520;
    for (iVar4 = 0; iVar4 < *param_1; iVar4 = iVar4 + 1) {
      FUN_00407e14((char *)*puVar3,piVar1);
      puVar3 = puVar3 + 1;
    }
    FUN_0043858c(piVar1);
    DAT_004686b0 = (int *)(&DAT_0046851c)[DAT_0046851c];
    FUN_0040aebc();
    FUN_00407ffc(DAT_004686b0,'\0');
    FUN_0040aebc();
    uVar2 = 0;
  }
  return uVar2;
}
```

## 0x40c6e4 (selector 0x40c6e4)

REA `ev_811b6cd793aa55c25369d67fd69884a8801e1365b488adf59c157e4f03e2a518`, batch1.

```c
void __cdecl FUN_0040c6e4(int *param_1)

{
  uint *puVar1;
  int iVar2;
  int *piVar3;
  undefined4 *puVar4;
  undefined4 *in_FS_OFFSET;
  undefined4 local_2c;

  FUN_00437a40(0x44567c);
  FUN_0040ebec(DAT_00468518);
  FUN_0040d1ec((int)param_1);
  if (DAT_004686b0 != (int *)0x0) {
    FUN_004089cc((int)DAT_004686b0);
  }
  piVar3 = (int *)&DAT_00468520;
  for (iVar2 = 0; iVar2 < *param_1; iVar2 = iVar2 + 1) {
    FUN_00407b94(*piVar3,3);
    piVar3 = piVar3 + 1;
  }
  puVar4 = &DAT_00468520;
  for (iVar2 = 0; iVar2 < *param_1; iVar2 = iVar2 + 1) {
    puVar1 = FUN_0043f120(0x772);
    if (puVar1 != (uint *)0x0) {
      FUN_00407a80(puVar1,iVar2 + 1);
    }
    *puVar4 = puVar1;
    puVar4 = puVar4 + 1;
  }
  DAT_0046851c = 1;
  DAT_004686b0 = DAT_00468520;
  FUN_00407ffc(DAT_00468520,'\x01');
  *in_FS_OFFSET = local_2c;
  return;
}
```

## 0x407d44 (selector 0x407d44)

REA `ev_811b6cd793aa55c25369d67fd69884a8801e1365b488adf59c157e4f03e2a518`, batch1.

```c
void __cdecl FUN_00407d44(byte *param_1,int *param_2)

{
  byte *pbVar1;
  undefined4 local_c;
  int local_8;

  FUN_00439004(param_1 + 4,1,1,param_2);
  FUN_00439004(param_1,4,1,param_2);
  FUN_00439004(param_1 + 0x73b,1,1,param_2);
  FUN_00439004(param_1 + 0x737,4,1,param_2);
  FUN_00439004(param_1 + 0x716,8,1,param_2);
  FUN_00439004(param_1 + 0x1a1,4,1,param_2);
  pbVar1 = param_1 + 0x1a5;
  for (local_8 = 0; local_8 < *(int *)(param_1 + 0x1a1); local_8 = local_8 + 1) {
    local_c = (**(code **)(**(int **)pbVar1 + 0x1c))();
    FUN_00439004((byte *)&local_c,4,1,param_2);
    (**(code **)(**(int **)pbVar1 + 0x10))();
    pbVar1 = pbVar1 + 4;
  }
  return;
}
```

## 0x407e14 (selector 0x407e14)

REA `ev_811b6cd793aa55c25369d67fd69884a8801e1365b488adf59c157e4f03e2a518`, batch1.

```c
void __cdecl FUN_00407e14(char *param_1,int *param_2)

{
  undefined4 uVar1;
  int *piVar2;
  char *pcVar3;
  undefined4 *in_FS_OFFSET;
  int local_40;
  int local_3c;
  int local_38;
  undefined4 local_34;
  undefined2 local_24;
  uint *local_10;
  uint *local_c;
  uint *local_8;

  FUN_00437a40(0x444906);
  piVar2 = (int *)(param_1 + 0x1a5);
  for (local_3c = 0; local_3c < *(int *)(param_1 + 0x1a1); local_3c = local_3c + 1) {
    FUN_0043f0ec(*piVar2);
    piVar2 = piVar2 + 1;
  }
  FUN_00438e28(param_1 + 4,1,1,param_2);
  FUN_00438e28(param_1,4,1,param_2);
  FUN_00438e28(param_1 + 0x73b,1,1,param_2);
  FUN_00438e28(param_1 + 0x737,4,1,param_2);
  FUN_00438e28(param_1 + 0x716,8,1,param_2);
  FUN_00438e28(param_1 + 0x1a1,4,1,param_2);
  pcVar3 = param_1 + 0x1a5;
  for (local_40 = 0; local_40 < *(int *)(param_1 + 0x1a1); local_40 = local_40 + 1) {
    FUN_00438e28((char *)&local_38,4,1,param_2);
    if (local_38 == 0) {
      local_8 = FUN_0043f120(0x287);
      if (local_8 != (uint *)0x0) {
        local_24 = 0x14;
        FUN_00404150(local_8,s_Speak_00444adc + 5,0,0);
        local_24 = 8;
      }
      *(uint **)pcVar3 = local_8;
    }
    else if (local_38 == 2) {
      local_c = FUN_0043f120(0x298);
      if (local_c != (uint *)0x0) {
        local_24 = 0x2c;
        FUN_00404bf0(local_c,s_Speak_00444adc + 5,0,0,(undefined4 *)0x0);
        local_24 = 0x20;
      }
      *(uint **)pcVar3 = local_c;
    }
    else if (local_38 == 3) {
      local_10 = FUN_0043f120(0x298);
      if (local_10 != (uint *)0x0) {
        local_24 = 0x44;
        FUN_00403db8(local_10);
        local_24 = 0x38;
      }
      *(uint **)pcVar3 = local_10;
    }
    (**(code **)(**(int **)pcVar3 + 0xc))();
    pcVar3 = pcVar3 + 4;
  }
  uVar1 = FUN_0040a8dc((int)param_1,s_Mainhero_00444b21);
  *(undefined4 *)(param_1 + 0x76e) = uVar1;
  *in_FS_OFFSET = local_34;
  return;
}
```

## 0x407ffc (selector 0x407ffc)

REA `ev_811b6cd793aa55c25369d67fd69884a8801e1365b488adf59c157e4f03e2a518`, batch1.

```c
void __cdecl FUN_00407ffc(int *param_1,char param_2)

{
  int iVar1;
  CHAR local_104 [256];

  *(undefined1 *)((int)param_1 + 0x73b) = 0;
  *(undefined4 *)((int)param_1 + 0x705) = 0;
  *(undefined4 *)((int)param_1 + 5) = 0;
  *(undefined4 *)((int)param_1 + 0x751) = 0;
  *(undefined4 *)((int)param_1 + 0x755) = 0;
  *(undefined4 *)((int)param_1 + 0xd) = 0;
  *(undefined4 *)((int)param_1 + 0x56d) = 0;
  *(undefined4 *)((int)param_1 + 0x639) = 0;
  *(undefined4 *)((int)param_1 + 0x732) = 0;
  *(undefined4 *)((int)param_1 + 0x72e) = 0;
  *(undefined4 *)((int)param_1 + 0x4f1) = 0;
  *(undefined4 *)((int)param_1 + 0x4c5) = 0;
  *(undefined4 *)((int)param_1 + 0x70a) = 0;
  *(undefined4 *)((int)param_1 + 0x75a) = 0;
  *(undefined1 *)((int)param_1 + 0x736) = 0;
  DAT_00467df4 = 0;
  *DAT_00468758 = 1;
  FUN_0043a0ec(local_104,(byte *)s_Scripts_Level_d_scc_00444b67);
  FUN_004066c8(param_1,local_104);
  if (*(int *)((int)param_1 + 0x741) == 0) {
    iVar1 = param_1[1];
    *(undefined1 *)(param_1 + 1) = 0;
    FUN_004083bc((int)param_1);
    *(char *)(param_1 + 1) = (char)iVar1;
    *DAT_00468758 = 0;
    FUN_004084c0((int)param_1);
    *DAT_00468758 = 1;
    FUN_004081c8((int)param_1);
    if ((char)param_1[1] == '\0') {
      FUN_004079ac(param_1,0,0,&DAT_00444b7b);
    }
    if (param_2 == '\0') {
      if ((*(char *)((int)param_1 + 0x709) == '\0') && (-1 < *(int *)((int)param_1 + 0x716))) {
        FUN_0040868c((int)param_1,(undefined4 *)((int)param_1 + 0x716));
      }
    }
    else if (-1 < *(int *)((int)param_1 + 0x712)) {
      FUN_0040868c((int)param_1,
                   (undefined4 *)((int)param_1 + *(int *)((int)param_1 + 0x712) * 8 + 0x51d));
    }
    FUN_004079ac(param_1,0,0,s_Start_00444b80);
    iVar1 = FUN_0040a980((int)param_1,s_Arrow_00444b86);
    if (iVar1 != 0) {
      FUN_00404fb4(iVar1,'\x01');
    }
    *(undefined1 *)(param_1 + 1) = 1;
    FUN_00435084((undefined4 *)((int)param_1 + 0x335),(undefined4 *)((int)param_1 + 0x1a5),
                 *(int *)((int)param_1 + 0x1a1) << 2);
  }
  else {
    *(undefined1 *)((int)param_1 + 0x709) = 1;
  }
  return;
}
```

## 0x40422c (selector 0x40422c)

REA `ev_811b6cd793aa55c25369d67fd69884a8801e1365b488adf59c157e4f03e2a518`, batch1.

```c
void __cdecl FUN_0040422c(int param_1,int *param_2)

{
  FUN_00438e28((char *)(param_1 + 4),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x108),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x277),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x27b),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x27f),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x283),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x152),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 8),0x100,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x167),0x100,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x267),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x26b),4,1,param_2);
  return;
}
```

## 0x40c8bc (selector 0x40c929)

REA `ev_007343f8edabb3e4751856d5c45411e501130df914535926d6195fc0b23a63d9`, batch2.

```c
void __cdecl FUN_0040c8bc(int *param_1,int param_2)

{
  int *piVar1;
  undefined4 *puVar2;
  int iVar3;
  CHAR local_104 [256];

  FUN_0043a0ec(local_104,(byte *)s_slot_d_sav_004459c3);
  piVar1 = FUN_00438bb4(local_104,&DAT_004459bd);
  FUN_00439004((byte *)((int)param_1 + param_2 * 0x50 + 0x25),0x50,1,piVar1);
  FUN_0040ebd0(DAT_00468518,piVar1);
  FUN_0040d220((int)param_1,piVar1);
  FUN_00439004((byte *)&DAT_0046851c,4,1,piVar1);
  puVar2 = &DAT_00468520;
  for (iVar3 = 0; iVar3 < *param_1; iVar3 = iVar3 + 1) {
    FUN_00407d44((byte *)*puVar2,piVar1);
    puVar2 = puVar2 + 1;
  }
  FUN_0043858c(piVar1);
  return;
}
```

## 0x404318 (selector 0x404318)

REA `ev_007343f8edabb3e4751856d5c45411e501130df914535926d6195fc0b23a63d9`, batch2.

```c
void __cdecl FUN_00404318(int param_1,int *param_2)

{
  FUN_00439004((byte *)(param_1 + 4),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x108),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x277),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x27b),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x27f),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x283),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x152),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 8),0x100,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x167),0x100,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x267),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x26b),4,1,param_2);
  return;
}
```

## 0x404ce8 (selector 0x404ce8)

REA `ev_007343f8edabb3e4751856d5c45411e501130df914535926d6195fc0b23a63d9`, batch2.

```c
void __cdecl FUN_00404ce8(int param_1,int *param_2)

{
  FUN_0040422c(param_1,param_2);
  FUN_00438e28((char *)(param_1 + 0x287),0x10,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x297),1,1,param_2);
  return;
}
```

## 0x404d2c (selector 0x404d2c)

REA `ev_007343f8edabb3e4751856d5c45411e501130df914535926d6195fc0b23a63d9`, batch2.

```c
void __cdecl FUN_00404d2c(int param_1,int *param_2)

{
  FUN_00404318(param_1,param_2);
  FUN_00439004((byte *)(param_1 + 0x287),0x10,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x297),1,1,param_2);
  return;
}
```

## 0x40ebb4 (selector 0x40ebb4)

REA `ev_007343f8edabb3e4751856d5c45411e501130df914535926d6195fc0b23a63d9`, batch2.

```c
void __cdecl FUN_0040ebb4(int param_1,int *param_2)

{
  FUN_00438e28((char *)(param_1 + 4),4,100,param_2);
  return;
}
```

## 0x40d220 (selector 0x40d220)

REA `ev_007343f8edabb3e4751856d5c45411e501130df914535926d6195fc0b23a63d9`, batch2.

```c
void __cdecl FUN_0040d220(int param_1,int *param_2)

{
  FUN_00439004((byte *)(param_1 + 0x21),4,1,param_2);
  FUN_00439004((byte *)&DAT_00445724,4,0xe,param_2);
  return;
}
```

## 0x40d250 (selector 0x40d250)

REA `ev_007343f8edabb3e4751856d5c45411e501130df914535926d6195fc0b23a63d9`, batch2.

```c
void __cdecl FUN_0040d250(int param_1,int *param_2)

{
  FUN_00438e28((char *)(param_1 + 0x21),4,1,param_2);
  FUN_00438e28((char *)&DAT_00445724,4,0xe,param_2);
  return;
}
```

## 0x40d0b4 (selector 0x40d0b4)

REA `ev_5f7dad8bf57fe05e69b3fd9b5bd8cbcd33ea272dc5a09f0ceab2de6ac27e6d53`, batch3.

```c
void __cdecl FUN_0040d0b4(int param_1,int param_2)

{
  int iVar1;

  iVar1 = *(int *)(param_1 + 4);
  if ((((iVar1 != 4) && (iVar1 != 3)) && (iVar1 != 7)) &&
     (((*(char *)(param_1 + 0xc) != '\0' || (param_2 != 1)) &&
      ((DAT_004686b0 == 0 || (*(char *)(DAT_004686b0 + 0x709) == '\0')))))) {
    *(undefined4 *)(param_1 + 8) = *(undefined4 *)(param_1 + 4);
    FUN_0040cefc(param_1);
    if (*(int *)(param_1 + 4) == 0) {
      *(undefined4 *)(param_1 + 0x269) = 0;
    }
    if (param_2 < 1) {
      *(undefined4 *)(param_1 + 4) = 3;
      FUN_0040d508(param_1,(uint *)s_TZU_Interface_Load_load_tif_004459fa);
    }
    else {
      *(undefined4 *)(param_1 + 4) = 4;
      FUN_0040d508(param_1,(uint *)s_TZU_Interface_Save_save_tif_004459de);
    }
    *(undefined4 *)(param_1 + 0xd) = 0xffffffff;
  }
  return;
}
```

## 0x40ebd0 (selector 0x40ebd0)

REA `ev_5f7dad8bf57fe05e69b3fd9b5bd8cbcd33ea272dc5a09f0ceab2de6ac27e6d53`, batch3.

```c
void __cdecl FUN_0040ebd0(int param_1,int *param_2)

{
  FUN_00439004((byte *)(param_1 + 4),4,100,param_2);
  return;
}
```

## 0x40cefc (selector 0x40cefc)

REA `ev_07d49b1843fda503d26064c1159ea5f39180f7043537aba206249b505e1433b0`, batch4.

```c
undefined4 * __cdecl FUN_0040cefc(int param_1)

{
  int *piVar1;
  undefined4 *puVar2;
  int iVar3;
  int iVar4;
  undefined4 *puVar5;
  undefined4 *puVar6;
  CHAR local_104 [256];

  iVar4 = 0;
  do {
    FUN_0043a0ec(local_104,(byte *)s_slot_d_sav_004459c3);
    piVar1 = FUN_00438bb4(local_104,&DAT_004459c0);
    if (piVar1 == (int *)0x0) {
      puVar2 = (undefined4 *)(iVar4 * 0x50 + param_1 + 0x25);
      puVar5 = &DAT_004459ce;
      puVar6 = puVar2;
      for (iVar3 = 4; iVar3 != 0; iVar3 = iVar3 + -1) {
        *puVar6 = *puVar5;
        puVar5 = puVar5 + 1;
        puVar6 = puVar6 + 1;
      }
    }
    else {
      FUN_00438e28((char *)(iVar4 * 0x50 + param_1 + 0x25),0x50,1,piVar1);
      puVar2 = (undefined4 *)FUN_0043858c(piVar1);
    }
    iVar4 = iVar4 + 1;
  } while (iVar4 < 6);
  return puVar2;
}
```

## 0x40cf8c (selector 0x40cf8c)

REA `ev_07d49b1843fda503d26064c1159ea5f39180f7043537aba206249b505e1433b0`, batch4.

```c
undefined4 __cdecl FUN_0040cf8c(int *param_1,int param_2)

{
  char cVar1;
  int iVar2;
  char *pcVar3;
  uint uVar4;
  uint uVar5;
  char *pcVar6;
  undefined4 *in_FS_OFFSET;
  byte bVar7;
  undefined4 local_28;

  bVar7 = 0;
  FUN_00437a40(0x4456ac);
  if (param_1[1] == 6) {
    pcVar3 = FUN_00435274((uint *)((int)param_1 + 0x205));
    *(char **)((int)param_1 + 0x26d) = pcVar3;
    if (param_2 == 8) {
      if (0 < *(int *)((int)param_1 + 0x26d)) {
        *(undefined1 *)((int)param_1 + *(int *)((int)param_1 + 0x26d) + 0x204) = 0;
      }
    }
    else if (param_2 == 0xd) {
      if (0 < *(int *)((int)param_1 + 0x26d)) {
        uVar4 = 0xffffffff;
        pcVar3 = (char *)((int)param_1 + 0x205);
        do {
          pcVar6 = pcVar3;
          if (uVar4 == 0) break;
          uVar4 = uVar4 - 1;
          pcVar6 = pcVar3 + (uint)bVar7 * -2 + 1;
          cVar1 = *pcVar3;
          pcVar3 = pcVar6;
        } while (cVar1 != '\0');
        uVar4 = ~uVar4;
        pcVar3 = pcVar6 + -uVar4;
        pcVar6 = (char *)((int)param_1 + *(int *)((int)param_1 + 0xd) * 0x50 + 0x25);
        for (uVar5 = uVar4 >> 2; uVar5 != 0; uVar5 = uVar5 - 1) {
          *(undefined4 *)pcVar6 = *(undefined4 *)pcVar3;
          pcVar3 = pcVar3 + ((uint)bVar7 * -2 + 1) * 4;
          pcVar6 = pcVar6 + ((uint)bVar7 * -2 + 1) * 4;
        }
        for (uVar4 = uVar4 & 3; uVar4 != 0; uVar4 = uVar4 - 1) {
          *pcVar6 = *pcVar3;
          pcVar3 = pcVar3 + (uint)bVar7 * -2 + 1;
          pcVar6 = pcVar6 + (uint)bVar7 * -2 + 1;
        }
        FUN_0040c8bc(param_1,*(int *)((int)param_1 + 0xd));
        param_1[1] = 0;
        if (*(char **)((int)param_1 + 0x269) != (char *)0x0) {
          FUN_00403500(*(char **)((int)param_1 + 0x269),3);
          *(undefined4 *)((int)param_1 + 0x269) = 0;
        }
        iVar2 = DAT_00461680;
        *(undefined1 *)(DAT_00461680 + 0x20b) = 0;
        FUN_00402848(iVar2);
      }
    }
    else if (*(int *)((int)param_1 + 0x26d) < 0xf) {
      *(char *)((int)param_1 + 0x205 + *(int *)((int)param_1 + 0x26d)) = (char)param_2;
      *(undefined1 *)((int)param_1 + *(int *)((int)param_1 + 0x26d) + 0x206) = 0;
      *(int *)((int)param_1 + 0x26d) = *(int *)((int)param_1 + 0x26d) + 1;
    }
    *in_FS_OFFSET = local_28;
  }
  else {
    *in_FS_OFFSET = local_28;
  }
  return local_28;
}
```

## 0x403e70 (selector 0x403e70)

REA `ev_f086baace800fbf52eabd2b5ae2d54aae5ffd693e8f3fc9970f31041707b89af`, batch5.

```c
void __cdecl FUN_00403e70(int param_1,int *param_2)

{
  FUN_0040422c(param_1,param_2);
  FUN_00438e28((char *)(param_1 + 0x287),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x28b),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x28f),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x293),4,1,param_2);
  FUN_00438e28((char *)(param_1 + 0x297),1,1,param_2);
  return;
}
```

## 0x403ef0 (selector 0x403ef0)

REA `ev_f086baace800fbf52eabd2b5ae2d54aae5ffd693e8f3fc9970f31041707b89af`, batch5.

```c
void __cdecl FUN_00403ef0(int param_1,int *param_2)

{
  FUN_00404318(param_1,param_2);
  FUN_00439004((byte *)(param_1 + 0x287),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x28b),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x28f),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x293),4,1,param_2);
  FUN_00439004((byte *)(param_1 + 0x297),1,1,param_2);
  return;
}
```

## 0x40d1ec (selector 0x40d1ec)

REA `ev_73a0f6e26c6f2dabc869eb791a53b419f2c0f30acd3c4e155071541e1f4ab53c`, batch6.

```c
void __cdecl FUN_0040d1ec(int param_1)

{
  undefined4 *puVar1;
  undefined4 *puVar2;
  int iVar3;
  int iVar4;

  *(undefined4 *)(param_1 + 0x21) = 0;
  iVar4 = 0;
  puVar2 = &DAT_00445724;
  do {
    iVar3 = 0;
    puVar1 = puVar2;
    do {
      *puVar1 = 0;
      iVar3 = iVar3 + 1;
      puVar1 = puVar1 + 1;
    } while (iVar3 < 7);
    iVar4 = iVar4 + 1;
    puVar2 = puVar2 + 7;
  } while (iVar4 < 2);
  return;
}
```

## 0x40ebec (selector 0x40ebec)

REA `ev_73a0f6e26c6f2dabc869eb791a53b419f2c0f30acd3c4e155071541e1f4ab53c`, batch6.

```c
void __cdecl FUN_0040ebec(undefined4 *param_1)

{
  int iVar1;

  iVar1 = 0;
  do {
    param_1 = param_1 + 1;
    *param_1 = 0xffffffff;
    iVar1 = iVar1 + 1;
  } while (iVar1 < 100);
  return;
}
```

## 0x40c5a4 (selector 0x40c5a4)

REA `ev_d932eef870ec8b7995148fb28b0737997bdbf558b648dc70c943d3993688954c`, batch8.

```c
int * __cdecl FUN_0040c5a4(int *param_1,int param_2)

{
  uint *puVar1;
  int iVar2;
  undefined4 *puVar3;
  undefined4 *in_FS_OFFSET;
  undefined4 local_34;

  FUN_00437a40(0x44561c);
  *(undefined1 *)(param_1 + 3) = 0;
  *param_1 = param_2;
  param_1[2] = -1;
  param_1[1] = 1;
  *(undefined4 *)((int)param_1 + 0x1d) = 0;
  *(undefined4 *)((int)param_1 + 0x19) = 0;
  DAT_004686b0 = 0;
  *(undefined4 *)((int)param_1 + 0x269) = 0;
  *(undefined1 *)((int)param_1 + 0x271) = 0;
  *(undefined4 *)((int)param_1 + 0x11) = 0;
  *(undefined4 *)((int)param_1 + 0x15) = 0xffffffff;
  *(undefined4 *)((int)param_1 + 0x21) = 0;
  puVar1 = FUN_0043f120(0x4b8);
  if (puVar1 != (uint *)0x0) {
    FUN_0040eacc(puVar1);
  }
  DAT_00468518 = puVar1;
  FUN_0040d1cc((int)param_1);
  puVar3 = &DAT_00468520;
  for (iVar2 = 0; iVar2 < *param_1; iVar2 = iVar2 + 1) {
    puVar1 = FUN_0043f120(0x772);
    if (puVar1 != (uint *)0x0) {
      FUN_00407a80(puVar1,iVar2 + 1);
    }
    *puVar3 = puVar1;
    puVar3 = puVar3 + 1;
  }
  FUN_0040c540();
  puVar1 = FUN_0043f120(0x92);
  if (puVar1 != (uint *)0x0) {
    FUN_00402e34((int)puVar1,PTR_s_Sound_Interface_click2_wav_0044556c);
  }
  *(uint **)((int)param_1 + 0x265) = puVar1;
  *in_FS_OFFSET = local_34;
  return param_1;
}
```

## 0x405784 (selector 0x405784)

REA `ev_a3e401286264fecbd4e307804b341a27f261c7318729361ba7d79782f1eee7b9`, batch9.

```c
undefined4 __stdcall FUN_00405784(void)

{
  return 0;
}
```

## Assembly: scene-loader

REA `ev_005a2130bf5a8cae7ade721a26280a4a113fc6a0921f8f458f234453fc19ffe9`.

```asm
0x407ffc: PUSH EBP
0x407ffd: MOV EBP, ESP
0x407fff: ADD ESP, 0xffffff00
0x408005: XOR EAX, EAX
0x408007: XOR EDX, EDX
0x408009: XOR ECX, ECX
0x40800b: PUSH EBX
0x40800c: PUSH ESI
0x40800d: MOV ESI, dword ptr [EBP + 0x8]
0x408010: MOV byte ptr [ESI + 0x73b], 0x0
0x408017: MOV dword ptr [ESI + 0x705], EAX
0x40801d: MOV dword ptr [ESI + 0x5], EDX
0x408020: MOV dword ptr [ESI + 0x751], ECX
0x408026: XOR EAX, EAX
0x408028: MOV dword ptr [ESI + 0x755], EAX
0x40802e: XOR EDX, EDX
0x408030: MOV dword ptr [ESI + 0xd], EDX
0x408033: XOR ECX, ECX
0x408035: MOV dword ptr [ESI + 0x56d], ECX
0x40803b: XOR EAX, EAX
0x40803d: MOV dword ptr [ESI + 0x639], EAX
0x408043: XOR EDX, EDX
0x408045: MOV dword ptr [ESI + 0x732], EDX
0x40804b: XOR ECX, ECX
0x40804d: MOV dword ptr [ESI + 0x72e], ECX
0x408053: XOR EAX, EAX
0x408055: MOV dword ptr [ESI + 0x4f1], EAX
0x40805b: XOR EDX, EDX
0x40805d: MOV dword ptr [ESI + 0x4c5], EDX
0x408063: XOR ECX, ECX
0x408065: MOV dword ptr [ESI + 0x70a], ECX
0x40806b: XOR EAX, EAX
0x40806d: MOV dword ptr [ESI + 0x75a], EAX
0x408073: XOR EDX, EDX
0x408075: MOV byte ptr [ESI + 0x736], 0x0
0x40807c: MOV dword ptr [0x00467df4], EDX
0x408082: LEA EDX, [EBP + 0xffffff00]
0x408088: MOV ECX, dword ptr [0x00468758]
0x40808e: MOV dword ptr [ECX], 0x1
0x408094: MOV EAX, dword ptr [ESI + 0x9]
0x408097: PUSH EAX
0x408098: PUSH 0x444b67
0x40809d: PUSH EDX
0x40809e: CALL 0x0043a0ec
0x4080a3: ADD ESP, 0xc
0x4080a6: LEA ECX, [EBP + 0xffffff00]
0x4080ac: PUSH ECX
0x4080ad: PUSH ESI
0x4080ae: CALL 0x004066c8
0x4080b3: ADD ESP, 0x8
0x4080b6: MOV EAX, dword ptr [ESI + 0x741]
0x4080bc: TEST EAX, EAX
0x4080be: JZ 0x004080cc
0x4080c0: MOV byte ptr [ESI + 0x709], 0x1
0x4080c7: JMP 0x004081c1
0x4080cc: MOV BL, byte ptr [ESI + 0x4]
0x4080cf: MOV byte ptr [ESI + 0x4], 0x0
0x4080d3: PUSH ESI
0x4080d4: CALL 0x004083bc
0x4080d9: POP ECX
0x4080da: MOV byte ptr [ESI + 0x4], BL
0x4080dd: MOV EAX, [0x00468758]
0x4080e2: XOR EDX, EDX
0x4080e4: MOV dword ptr [EAX], EDX
0x4080e6: PUSH ESI
0x4080e7: CALL 0x004084c0
0x4080ec: POP ECX
0x4080ed: MOV ECX, dword ptr [0x00468758]
0x4080f3: MOV dword ptr [ECX], 0x1
0x4080f9: PUSH ESI
0x4080fa: CALL 0x004081c8
0x4080ff: POP ECX
0x408100: MOV AL, byte ptr [ESI + 0x4]
0x408103: TEST AL, AL
0x408105: JNZ 0x00408119
0x408107: PUSH 0x444b7b
0x40810c: PUSH 0x0
0x40810e: PUSH 0x0
0x408110: PUSH ESI
0x408111: CALL 0x004079ac
0x408116: ADD ESP, 0x10
0x408119: MOV DL, byte ptr [EBP + 0xc]
0x40811c: TEST DL, DL
0x40811e: JZ 0x00408148
0x408120: MOV EAX, dword ptr [ESI + 0x712]
0x408126: TEST EAX, EAX
0x408128: JL 0x0040816e
0x40812a: MOV EDX, dword ptr [ESI + EAX*0x4 + 0x4f5]
0x408131: SHL EAX, 0x3
0x408134: PUSH EDX
0x408135: ADD EAX, ESI
0x408137: ADD EAX, 0x51d
0x40813c: PUSH EAX
0x40813d: PUSH ESI
0x40813e: CALL 0x0040868c
0x408143: ADD ESP, 0xc
0x408146: JMP 0x0040816e
0x408148: MOV CL, byte ptr [ESI + 0x709]
0x40814e: TEST CL, CL
0x408150: JNZ 0x0040816e
0x408152: MOV EAX, dword ptr [ESI + 0x716]
0x408158: TEST EAX, EAX
0x40815a: JL 0x0040816e
0x40815c: PUSH 0x0
0x40815e: LEA EDX, [ESI + 0x716]
0x408164: PUSH EDX
0x408165: PUSH ESI
0x408166: CALL 0x0040868c
0x40816b: ADD ESP, 0xc
0x40816e: PUSH 0x444b80
0x408173: PUSH 0x0
0x408175: PUSH 0x0
0x408177: PUSH ESI
0x408178: CALL 0x004079ac
0x40817d: ADD ESP, 0x10
0x408180: PUSH 0x444b86
0x408185: PUSH ESI
0x408186: CALL 0x0040a980
0x40818b: ADD ESP, 0x8
0x40818e: TEST EAX, EAX
0x408190: JZ 0x0040819d
0x408192: PUSH 0x1
0x408194: PUSH EAX
0x408195: CALL 0x00404fb4
0x40819a: ADD ESP, 0x8
0x40819d: MOV byte ptr [ESI + 0x4], 0x1
0x4081a1: MOV ECX, dword ptr [ESI + 0x1a1]
0x4081a7: LEA EAX, [ESI + 0x1a5]
0x4081ad: SHL ECX, 0x2
0x4081b0: ADD ESI, 0x335
0x4081b6: PUSH ECX
0x4081b7: PUSH EAX
0x4081b8: PUSH ESI
0x4081b9: CALL 0x00435084
0x4081be: ADD ESP, 0xc
0x4081c1: POP ESI
0x4081c2: POP EBX
0x4081c3: MOV ESP, EBP
0x4081c5: POP EBP
0x4081c6: RET
```

## Assembly: placement

REA `ev_d9c65754b25036170307a83d372f03b5329ab2a3511779fb1dd4740519eef0a5`.

```asm
0x40868c: PUSH EBP
0x40868d: MOV EBP, ESP
0x40868f: ADD ESP, 0xfffffef4
0x408695: PUSH EBX
0x408696: PUSH ESI
0x408697: MOV EBX, dword ptr [EBP + 0x8]
0x40869a: MOV EAX, dword ptr [EBP + 0x10]
0x40869d: PUSH EAX
0x40869e: PUSH 0x444b99
0x4086a3: LEA EDX, [EBP + 0xffffff00]
0x4086a9: PUSH EDX
0x4086aa: CALL 0x0043a0ec
0x4086af: ADD ESP, 0xc
0x4086b2: LEA ECX, [EBP + 0xffffff00]
0x4086b8: PUSH ECX
0x4086b9: PUSH EBX
0x4086ba: CALL 0x0040a980
0x4086bf: ADD ESP, 0x8
0x4086c2: MOV ESI, EAX
0x4086c4: PUSH 0x1
0x4086c6: PUSH ESI
0x4086c7: CALL 0x00404fb4
0x4086cc: ADD ESP, 0x8
0x4086cf: PUSH -0x1
0x4086d1: PUSH EBX
0x4086d2: PUSH ESI
0x4086d3: CALL 0x00405064
0x4086d8: MOV EAX, dword ptr [EBP + 0xc]
0x4086db: ADD ESP, 0xc
0x4086de: LEA ECX, [EBX + 0x716]
0x4086e4: MOV EDX, dword ptr [EAX]
0x4086e6: MOV dword ptr [EBX + 0x716], EDX
0x4086ec: MOV EDX, dword ptr [EAX + 0x4]
0x4086ef: MOV dword ptr [EBX + 0x71a], EDX
0x4086f5: PUSH ECX
0x4086f6: PUSH EBX
0x4086f7: CALL 0x00409874
0x4086fc: ADD ESP, 0x8
0x4086ff: MOV EAX, dword ptr [EBX + 0x71a]
0x408705: PUSH EAX
0x408706: MOV EDX, dword ptr [EBX + 0x716]
0x40870c: PUSH EDX
0x40870d: PUSH EBX
0x40870e: CALL 0x00405968
0x408713: ADD ESP, 0xc
0x408716: MOV ECX, dword ptr [EBX + 0x76e]
0x40871c: MOV dword ptr [ECX + 0x108], EAX
0x408722: MOV EAX, dword ptr [EBX + 0x71a]
0x408728: PUSH EAX
0x408729: MOV EDX, dword ptr [EBX + 0x716]
0x40872f: PUSH EDX
0x408730: PUSH EBX
0x408731: CALL 0x004059c0
0x408736: ADD ESP, 0xc
0x408739: MOV ESI, dword ptr [EBX + 0x76e]
0x40873f: FST float ptr [ESI + 0x283]
0x408745: FSTP float ptr [ESI + 0x27f]
0x40874b: PUSH ESI
0x40874c: CALL 0x00404414
0x408751: POP ECX
0x408752: MOV EAX, dword ptr [EBX + 0x76e]
0x408758: PUSH EAX
0x408759: CALL 0x00404404
0x40875e: POP ECX
0x40875f: MOV EDX, EAX
0x408761: MOV ECX, dword ptr [EBX + 0x75e]
0x408767: SAR ECX, 0x1
0x408769: JNS 0x0040876e
0x40876b: ADC ECX, 0x0
0x40876e: MOV ESI, dword ptr [EBX + 0x716]
0x408774: SUB ESI, ECX
0x408776: MOV dword ptr [EBP + 0xfffffefc], ESI
0x40877c: FILD dword ptr [EBP + 0xfffffefc]
0x408782: MOV EAX, dword ptr [EBX + 0x76e]
0x408788: FSTP float ptr [EAX + 0x277]
0x40878e: MOV ECX, dword ptr [EBX + 0x762]
0x408794: SAR ECX, 0x1
0x408796: JNS 0x0040879b
0x408798: ADC ECX, 0x0
0x40879b: MOV ESI, dword ptr [EBX + 0x71a]
0x4087a1: SUB ECX, ESI
0x4087a3: MOV dword ptr [EBP + 0xfffffefc], ECX
0x4087a9: XOR ECX, ECX
0x4087ab: FILD dword ptr [EBP + 0xfffffefc]
0x4087b1: MOV EDX, dword ptr [EDX + 0xc]
0x4087b4: MOV dword ptr [EBP + 0xfffffef4], EDX
0x4087ba: MOV dword ptr [EBP + 0xfffffef8], ECX
0x4087c0: FILD qword ptr [EBP + 0xfffffef4]
0x4087c6: FMUL float ptr [EAX + 0x27f]
0x4087cc: FMUL float ptr [0x004087e8]
0x4087d2: FADDP
0x4087d4: FSTP float ptr [EAX + 0x27b]
0x4087da: PUSH EBX
0x4087db: CALL 0x00408920
0x4087e0: POP ECX
0x4087e1: POP ESI
0x4087e2: POP EBX
0x4087e3: MOV ESP, EBP
0x4087e5: POP EBP
0x4087e6: RET
```

## Assembly: probe1

REA `ev_3fbebb517cad8cacd588c2eaf819f6d5b8aee7b1760ca37c742fcf5bd9d7718f`.

```asm
0x407d44: PUSH EBP
0x407d45: MOV EBP, ESP
0x407d47: ADD ESP, -0x8
0x407d4a: PUSH EBX
0x407d4b: PUSH ESI
0x407d4c: PUSH EDI
0x407d4d: MOV ESI, dword ptr [EBP + 0xc]
0x407d50: MOV EDI, dword ptr [EBP + 0x8]
0x407d53: PUSH ESI
0x407d54: PUSH 0x1
0x407d56: PUSH 0x1
0x407d58: LEA EAX, [EDI + 0x4]
0x407d5b: PUSH EAX
0x407d5c: CALL 0x00439004
0x407d61: ADD ESP, 0x10
0x407d64: PUSH ESI
0x407d65: PUSH 0x1
0x407d67: PUSH 0x4
0x407d69: PUSH EDI
0x407d6a: CALL 0x00439004
0x407d6f: ADD ESP, 0x10
0x407d72: PUSH ESI
0x407d73: PUSH 0x1
0x407d75: PUSH 0x1
0x407d77: LEA EDX, [EDI + 0x73b]
0x407d7d: PUSH EDX
0x407d7e: CALL 0x00439004
0x407d83: ADD ESP, 0x10
0x407d86: PUSH ESI
0x407d87: PUSH 0x1
0x407d89: PUSH 0x4
0x407d8b: LEA ECX, [EDI + 0x737]
0x407d91: PUSH ECX
0x407d92: CALL 0x00439004
0x407d97: ADD ESP, 0x10
0x407d9a: PUSH ESI
0x407d9b: PUSH 0x1
0x407d9d: PUSH 0x8
0x407d9f: LEA EAX, [EDI + 0x716]
0x407da5: PUSH EAX
0x407da6: CALL 0x00439004
0x407dab: ADD ESP, 0x10
0x407dae: PUSH ESI
0x407daf: PUSH 0x1
0x407db1: PUSH 0x4
0x407db3: LEA EDX, [EDI + 0x1a1]
0x407db9: PUSH EDX
0x407dba: CALL 0x00439004
0x407dbf: ADD ESP, 0x10
0x407dc2: XOR ECX, ECX
0x407dc4: LEA EBX, [EDI + 0x1a5]
0x407dca: MOV dword ptr [EBP + -0x4], ECX
0x407dcd: JMP 0x00407dfe
0x407dcf: MOV EAX, dword ptr [EBX]
0x407dd1: PUSH EAX
0x407dd2: MOV EDX, dword ptr [EAX]
0x407dd4: CALL dword ptr [EDX + 0x1c]
0x407dd7: POP ECX
0x407dd8: MOV dword ptr [EBP + -0x8], EAX
0x407ddb: PUSH ESI
0x407ddc: PUSH 0x1
0x407dde: PUSH 0x4
0x407de0: LEA ECX, [EBP + -0x8]
0x407de3: PUSH ECX
0x407de4: CALL 0x00439004
0x407de9: ADD ESP, 0x10
0x407dec: PUSH ESI
0x407ded: MOV EAX, dword ptr [EBX]
0x407def: PUSH EAX
0x407df0: MOV EDX, dword ptr [EAX]
0x407df2: CALL dword ptr [EDX + 0x10]
0x407df5: ADD ESP, 0x8
0x407df8: INC dword ptr [EBP + -0x4]
0x407dfb: ADD EBX, 0x4
0x407dfe: MOV ECX, dword ptr [EDI + 0x1a1]
0x407e04: MOV EAX, dword ptr [EBP + -0x4]
0x407e07: CMP ECX, EAX
0x407e09: JG 0x00407dcf
0x407e0b: POP EDI
0x407e0c: POP ESI
0x407e0d: POP EBX
0x407e0e: POP ECX
0x407e0f: POP ECX
0x407e10: POP EBP
0x407e11: RET
```

## Assembly: assembly4

REA `ev_52ebca7fb7ca5c4e9c4073327fb66e7c34c2e780f96ce79ab890233918408be6`.

```asm
0x40c7c4: PUSH EBP
0x40c7c5: MOV EBP, ESP
0x40c7c7: ADD ESP, 0xffffff00
0x40c7cd: PUSH EBX
0x40c7ce: PUSH ESI
0x40c7cf: PUSH EDI
0x40c7d0: CALL 0x0040aebc
0x40c7d5: MOV EAX, dword ptr [EBP + 0xc]
0x40c7d8: LEA EDX, [EBP + 0xffffff00]
0x40c7de: PUSH EAX
0x40c7df: PUSH 0x4459c3
0x40c7e4: PUSH EDX
0x40c7e5: CALL 0x0043a0ec
0x40c7ea: ADD ESP, 0xc
0x40c7ed: PUSH 0x4459c0
0x40c7f2: LEA ECX, [EBP + 0xffffff00]
0x40c7f8: PUSH ECX
0x40c7f9: CALL 0x00438bb4
0x40c7fe: ADD ESP, 0x8
0x40c801: MOV EBX, EAX
0x40c803: TEST EBX, EBX
0x40c805: JNZ 0x0040c80f
0x40c807: OR EAX, 0xffffffff
0x40c80a: JMP 0x0040c8b3
0x40c80f: MOV EAX, [0x004686b0]
0x40c814: TEST EAX, EAX
0x40c816: JZ 0x0040c81f
0x40c818: PUSH EAX
0x40c819: CALL 0x004089cc
0x40c81e: POP ECX
0x40c81f: PUSH 0x0
0x40c821: PUSH 0x50
0x40c823: PUSH EBX
0x40c824: CALL 0x00438f04
0x40c829: ADD ESP, 0xc
0x40c82c: PUSH EBX
0x40c82d: MOV EDX, dword ptr [0x00468518]
0x40c833: PUSH EDX
0x40c834: CALL 0x0040ebb4
0x40c839: ADD ESP, 0x8
0x40c83c: PUSH EBX
0x40c83d: MOV ECX, dword ptr [EBP + 0x8]
0x40c840: PUSH ECX
0x40c841: CALL 0x0040d250
0x40c846: ADD ESP, 0x8
0x40c849: PUSH EBX
0x40c84a: PUSH 0x1
0x40c84c: PUSH 0x4
0x40c84e: PUSH 0x46851c
0x40c853: CALL 0x00438e28
0x40c858: ADD ESP, 0x10
0x40c85b: XOR EDI, EDI
0x40c85d: MOV ESI, 0x468520
0x40c862: JMP 0x0040c874
0x40c864: PUSH EBX
0x40c865: MOV EAX, dword ptr [ESI]
0x40c867: PUSH EAX
0x40c868: CALL 0x00407e14
0x40c86d: ADD ESP, 0x8
0x40c870: INC EDI
0x40c871: ADD ESI, 0x4
0x40c874: MOV EDX, dword ptr [EBP + 0x8]
0x40c877: MOV ECX, dword ptr [EDX]
0x40c879: CMP EDI, ECX
0x40c87b: JL 0x0040c864
0x40c87d: PUSH EBX
0x40c87e: CALL 0x0043858c
0x40c883: POP ECX
0x40c884: MOV EAX, [0x0046851c]
0x40c889: MOV EDX, dword ptr [EAX*0x4 + 0x46851c]
0x40c890: MOV dword ptr [0x004686b0], EDX
0x40c896: CALL 0x0040aebc
0x40c89b: PUSH 0x0
0x40c89d: MOV ECX, dword ptr [0x004686b0]
0x40c8a3: PUSH ECX
0x40c8a4: CALL 0x00407ffc
0x40c8a9: ADD ESP, 0x8
0x40c8ac: CALL 0x0040aebc
0x40c8b1: XOR EAX, EAX
0x40c8b3: POP EDI
0x40c8b4: POP ESI
0x40c8b5: POP EBX
0x40c8b6: MOV ESP, EBP
0x40c8b8: POP EBP
0x40c8b9: RET
```

## Assembly: assembly5

REA `ev_e58b309d9dff61f8a09b430f6eda18173b17b1b68bbd1ea9b11bc7d2b1f3b6f7`.

```asm
0x40f204: PUSH EBP
0x40f205: MOV EBP, ESP
0x40f207: ADD ESP, -0x24
0x40f20a: MOV EAX, 0x446269
0x40f20f: PUSH EBX
0x40f210: PUSH ESI
0x40f211: PUSH EDI
0x40f212: MOV EDI, dword ptr [EBP + 0x14]
0x40f215: MOV EBX, dword ptr [EBP + 0x10]
0x40f218: MOV ESI, dword ptr [EBP + 0xc]
0x40f21b: CALL 0x00437a40
0x40f220: MOV EDX, ESI
0x40f222: CMP EDX, 0x102
0x40f228: JG 0x0040f260
0x40f22a: JZ 0x0040f40e
0x40f230: CMP EDX, 0x1c
0x40f233: JG 0x0040f24a
0x40f235: JZ 0x0040f27c
0x40f237: DEC EDX
0x40f238: JZ 0x0040f462
0x40f23e: DEC EDX
0x40f23f: JZ 0x0040f456
0x40f245: JMP 0x0040f462
0x40f24a: SUB EDX, 0x20
0x40f24d: JZ 0x0040f287
0x40f24f: SUB EDX, 0xe0
0x40f255: JZ 0x0040f342
0x40f25b: JMP 0x0040f462
0x40f260: SUB EDX, 0x200
0x40f266: JZ 0x0040f2a2
0x40f268: DEC EDX
0x40f269: JZ 0x0040f2df
0x40f26b: DEC EDX
0x40f26c: JZ 0x0040f336
0x40f272: SUB EDX, 0x2
0x40f275: JZ 0x0040f2cd
0x40f277: JMP 0x0040f462
0x40f27c: MOV dword ptr [0x00468784], EBX
0x40f282: JMP 0x0040f462
0x40f287: PUSH 0x0
0x40f289: CALL 0x00442566
0x40f28e: MOV EAX, 0x1
0x40f293: MOV EDX, dword ptr [EBP + -0x24]
0x40f296: MOV dword ptr FS:[0x0], EDX
0x40f29d: JMP 0x0040f478
0x40f2a2: MOV EAX, EDI
0x40f2a4: MOV CL, byte ptr [0x00446268]
0x40f2aa: SHR EAX, 0x10
0x40f2ad: PUSH ECX
0x40f2ae: AND AX, 0xffff
0x40f2b2: MOVZX EDX, AX
0x40f2b5: MOVZX ECX, DI
0x40f2b8: PUSH EDX
0x40f2b9: PUSH ECX
0x40f2ba: MOV EAX, [0x00468788]
0x40f2bf: PUSH EAX
0x40f2c0: CALL 0x0040d148
0x40f2c5: ADD ESP, 0x10
0x40f2c8: JMP 0x0040f462
0x40f2cd: MOV EDX, dword ptr [0x00468788]
0x40f2d3: PUSH EDX
0x40f2d4: CALL 0x0040e9f0
0x40f2d9: POP ECX
0x40f2da: JMP 0x0040f462
0x40f2df: MOV EAX, [0x00446254]
0x40f2e4: TEST EAX, EAX
0x40f2e6: JZ 0x0040f307
0x40f2e8: PUSH 0x3
0x40f2ea: PUSH EAX
0x40f2eb: CALL 0x00402380
0x40f2f0: ADD ESP, 0x8
0x40f2f3: XOR EDX, EDX
0x40f2f5: MOV dword ptr [0x00446254], EDX
0x40f2fb: MOV byte ptr [0x00446260], 0x1
0x40f302: JMP 0x0040f462
0x40f307: MOV ECX, EDI
0x40f309: MOV byte ptr [0x00446268], 0x1
0x40f310: SHR ECX, 0x10
0x40f313: MOVZX EDX, DI
0x40f316: AND CX, 0xffff
0x40f31b: MOVZX EAX, CX
0x40f31e: PUSH EAX
0x40f31f: PUSH EDX
0x40f320: MOV ECX, dword ptr [0x00468788]
0x40f326: PUSH 0x0
0x40f328: PUSH ECX
0x40f329: CALL 0x0040cb84
0x40f32e: ADD ESP, 0x10
0x40f331: JMP 0x0040f462
0x40f336: MOV byte ptr [0x00446268], 0x0
0x40f33d: JMP 0x0040f462
0x40f342: MOV EAX, [0x00446254]
0x40f347: TEST EAX, EAX
0x40f349: JZ 0x0040f36a
0x40f34b: PUSH 0x3
0x40f34d: PUSH EAX
0x40f34e: CALL 0x00402380
0x40f353: ADD ESP, 0x8
0x40f356: XOR EDX, EDX
0x40f358: MOV dword ptr [0x00446254], EDX
0x40f35e: MOV byte ptr [0x00446260], 0x1
0x40f365: JMP 0x0040f462
0x40f36a: MOV ECX, EBX
0x40f36c: CMP ECX, 0x72
0x40f36f: JG 0x0040f385
0x40f371: JZ 0x0040f3cb
0x40f373: SUB ECX, 0x1b
0x40f376: JZ 0x0040f392
0x40f378: SUB ECX, 0x55
0x40f37b: JZ 0x0040f3a3
0x40f37d: DEC ECX
0x40f37e: JZ 0x0040f3b5
0x40f380: JMP 0x0040f462
0x40f385: SUB ECX, 0x7a
0x40f388: JZ 0x0040f3e0
0x40f38a: DEC ECX
0x40f38b: JZ 0x0040f3f6
0x40f38d: JMP 0x0040f462
0x40f392: MOV EAX, [0x00468788]
0x40f397: PUSH EAX
0x40f398: CALL 0x0040cd6c
0x40f39d: POP ECX
0x40f39e: JMP 0x0040f462
0x40f3a3: MOV EDX, dword ptr [0x00468788]
0x40f3a9: PUSH EDX
0x40f3aa: CALL 0x0040d370
0x40f3af: POP ECX
0x40f3b0: JMP 0x0040f462
0x40f3b5: PUSH 0x1
0x40f3b7: MOV ECX, dword ptr [0x00468788]
0x40f3bd: PUSH ECX
0x40f3be: CALL 0x0040d0b4
0x40f3c3: ADD ESP, 0x8
0x40f3c6: JMP 0x0040f462
0x40f3cb: PUSH 0x0
0x40f3cd: MOV EAX, [0x00468788]
0x40f3d2: PUSH EAX
0x40f3d3: CALL 0x0040d0b4
0x40f3d8: ADD ESP, 0x8
0x40f3db: JMP 0x0040f462
0x40f3e0: MOVSX EDX, byte ptr [0x00468738]
0x40f3e7: CMP EDX, 0x1
0x40f3ea: SBB ECX, ECX
0x40f3ec: NEG ECX
0x40f3ee: MOV byte ptr [0x00468738], CL
0x40f3f4: JMP 0x0040f462
0x40f3f6: PUSH 0x0
0x40f3f8: PUSH 0x0
0x40f3fa: PUSH 0x10
0x40f3fc: XOR EAX, EAX
0x40f3fe: MOV EDX, dword ptr [EBP + 0x8]
0x40f401: MOV [0x00468784], EAX
0x40f406: PUSH EDX
0x40f407: CALL 0x0044254e
0x40f40c: JMP 0x0040f462
0x40f40e: CMP EBX, 0x30
0x40f411: JC 0x0040f418
0x40f413: CMP EBX, 0x39
0x40f416: JBE 0x0040f444
0x40f418: CMP EBX, 0xc0
0x40f41e: JC 0x0040f428
0x40f420: CMP EBX, 0xff
0x40f426: JBE 0x0040f444
0x40f428: CMP EBX, 0x40
0x40f42b: JC 0x0040f435
0x40f42d: CMP EBX, 0x80
0x40f433: JBE 0x0040f444
0x40f435: CMP EBX, 0x8
0x40f438: JZ 0x0040f444
0x40f43a: CMP EBX, 0xd
0x40f43d: JZ 0x0040f444
0x40f43f: CMP EBX, 0x20
0x40f442: JNZ 0x0040f462
0x40f444: PUSH EBX
0x40f445: MOV ECX, dword ptr [0x00468788]
0x40f44b: PUSH ECX
0x40f44c: CALL 0x0040cf8c
0x40f451: ADD ESP, 0x8
0x40f454: JMP 0x0040f462
0x40f456: CALL 0x0040f028
0x40f45b: PUSH 0x0
0x40f45d: CALL 0x00442554
0x40f462: PUSH EDI
0x40f463: PUSH EBX
0x40f464: PUSH ESI
0x40f465: MOV EAX, dword ptr [EBP + 0x8]
0x40f468: PUSH EAX
0x40f469: CALL 0x00442512
0x40f46e: MOV EDX, dword ptr [EBP + -0x24]
0x40f471: MOV dword ptr FS:[0x0], EDX
0x40f478: POP EDI
0x40f479: POP ESI
0x40f47a: POP EBX
0x40f47b: MOV ESP, EBP
0x40f47d: POP EBP
0x40f47e: RET 0x10
```
