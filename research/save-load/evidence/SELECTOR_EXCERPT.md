## Selector / backup selector (parser projection)

REA `ev_6df8d69f267166d6496f1b59f2e234b87484310e4f38efa0ca232401983e5e08`, full parser function `0x4066c8`. These selected pseudocode lines establish use of scene+0 for conditional include and emission of selector backup opcodes0xd/0xe; they do not establish the original source-level field names.

```c
        }
        else if (iVar5 == 0x14c6c) {
          FUN_00438e6c(pbVar4,(byte *)s__d__d__s__s_00444aee);
          if ((*param_1 == local_64) || (*param_1 == local_68)) {
            FUN_004066c8(param_1,(LPCSTR)&local_1a0);
          }
          else {
            FUN_004066c8(param_1,local_2a0);
// ...
        FUN_00405cac((int *)puVar9,0x14,(char *)&local_1a0,0,0);
      }
      else if (iVar5 == 0x16923) {
        FUN_00405cac((int *)puVar9,0xe,s_Speak_00444adc + 5,0,0);
      }
    }
    else if (iVar5 < 0x1704d) {
      if (iVar5 == 0x1704c) {
// ...
        FUN_00405cac((int *)puVar9,0x1b,(char *)&local_1a0,local_60,0);
      }
      else if (iVar5 == 0x16c01) {
        FUN_00405cac((int *)puVar9,0xd,s_Speak_00444adc + 5,0,0);
      }
      else if (iVar5 == 0x16d55) {
        FUN_00438e6c(pbVar4,(byte *)(s__s__d__d__d__d__d__d_00444b03 + 0x12));
        FUN_00405cac((int *)puVar9,0x11,s_Speak_00444adc + 5,local_60,0);
```
